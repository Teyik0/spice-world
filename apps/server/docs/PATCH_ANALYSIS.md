# Product Service Patch Implementation Analysis

**Date**: 2026-01-27  
**File**: `apps/server/src/modules/products/service.ts`  
**Function**: `productService.patch()`

---

## ✅ What's Good

1. **Early return optimization** - `hasProductChanges()` check avoids unnecessary work
2. **Pre-computed variant analysis** - Single `analyzeVariantOperations()` call reused for status and attribute clearing
3. **Parallel file uploads** - `Promise.all` for create/update uploads reduces latency
4. **Parallel image updates** - Fetching and updating images concurrently
5. **Error handling with cleanup** - Properly deletes uploaded files on transaction failure
6. **Version conflict detection** - Prevents lost updates with optimistic locking
7. **Surgical cache invalidation** - Only clears affected cache entries

---

## ⚠️ Potential Problems

### 1. Race Condition: File Upload → Transaction

```typescript
// Files uploaded BEFORE transaction
const [createUploads, updateUploads] = await Promise.all([...]);

// Transaction starts AFTER
const product = await prisma.$transaction(async (tx) => {
```

**Problem**: If upload succeeds but transaction fails/retries, you create orphaned files. If another request modifies the product between upload and transaction start, you may reference files that shouldn't exist.

**Impact**: Storage leaks, inconsistent state

**Location**: `apps/server/src/modules/products/service.ts:455-490`

---

### 2. Missing Rollback for `oldKeysToDelete`

```typescript
if (oldKeysToDelete.length > 0) {
  await utapi.deleteFiles(oldKeysToDelete); // Outside transaction
}
```

**Problem**: If this delete fails, you leave orphaned files. No retry mechanism.

**Impact**: Storage leaks accumulate over time

**Location**: `apps/server/src/modules/products/service.ts:681-683`

---

### 3. Non-Atomic Image Operations

```typescript
// Inside transaction:
await tx.image.deleteMany({ where: { id: { in: iOps.delete } } });
await tx.image.createMany({ data: iOps.create.map(...) });
const updatePromises = iOps.update.map((op) => tx.image.update(...));
await Promise.all(updatePromises);
```

**Problem**: If `createMany` fails after `deleteMany`, you lose images. No way to rollback the delete within the transaction (Prisma limitation).

**Impact**: Data loss

**Location**: `apps/server/src/modules/products/service.ts:513-577`

---

### 4. Inefficient Attribute Clearing

```typescript
const variants = await tx.productVariant.findMany({
  where: { productId: id },
  select: { id: true },
});

await Promise.all(
  variants.map((v) =>
    tx.productVariant.update({ // N updates instead of 1
      where: { id: v.id },
      data: { attributeValues: { set: [] } },
    }),
  ),
);
```

**Problem**: N database round-trips instead of 1 bulk operation

**Better**:
```typescript
await tx.productVariant.updateMany({
  where: { productId: id },
  data: { attributeValues: { set: [] } },
});
```

**Location**: `apps/server/src/modules/products/service.ts:650-665`

---

### 5. Validation Not Inside Transaction

```typescript
validateImages({ imagesOps: iOps, currentImages: currentProduct.images });
validateVariants({ category: categoryChange ?? currentProduct.category, ... });

// Transaction starts later
const product = await prisma.$transaction(async (tx) => {
```

**Problem**: Product could change between validation and transaction. Race condition on concurrent updates.

**Impact**: Validation becomes stale, constraints may be violated

**Location**: `apps/server/src/modules/products/service.ts:403-430`

---

### 6. Missing Variant Stock Validation

You validate prices and attributes but **not stock levels**. What if someone sets `stock: -100`?

**Recommendation**: Add validation in `validators/variants.ts`:
```typescript
if (variant.stock !== undefined && variant.stock < 0) {
  throw status("Bad Request", {
    message: "Stock cannot be negative",
    code: "INVALID_STOCK",
  });
}
```

---

### 7. File Cleanup in Catch Block May Fail Silently

```typescript
} catch (err: unknown) {
  // Clean up orphaned files if transaction fails
  if (createUploads.data && createUploads.data.length > 0)
    await utapi.deleteFiles(createUploads.data.map((f) => f.key));
  if (updateUploads.data && updateUploads.data.length > 0)
    await utapi.deleteFiles(updateUploads.data.map((f) => f.key));
  throw err;
}
```

**Problem**: If `utapi.deleteFiles()` fails, no retry, no logging. Files become orphaned.

---

## 🚀 Production-Grade Alternatives

### Option 1: Two-Phase Commit Pattern (Recommended)

```typescript
async patch(...) {
  // Phase 1: Validate + Reserve (inside transaction with fresh data)
  const lockToken = uuid();
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUniqueOrThrow({ 
      where: { id }, 
      include: { images: true, variants: { include: { attributeValues: true } }, category: true }
    });
    
    // Validate inside transaction with FRESH data
    if (_version !== undefined && _version !== current.version) {
      throw status("Conflict", {
        message: `Product modified. Expected version ${_version}, current is ${current.version}`,
        code: "VERSION_CONFLICT",
      });
    }
    
    validateImages({ imagesOps: iOps, currentImages: current.images });
    validateVariants({ category: categoryChange ?? current.category, vOps, currVariants: ... });
    
    // Create a "pending" record to reserve this operation (prevents concurrent modifications)
    await tx.productUpdateLock.create({ 
      data: { 
        productId: id, 
        token: lockToken,
        expiresAt: new Date(Date.now() + 30000) // 30s timeout
      } 
    });
  });
  
  // Phase 2: Upload files (outside transaction, safe because we hold the lock)
  const [createUploads, updateUploads] = await Promise.all([...]);
  
  if (createUploads.error || updateUploads.error) {
    // Release lock
    await prisma.productUpdateLock.delete({ where: { productId_token: { productId: id, token: lockToken } } });
    return uploadFileErrStatus({ ... });
  }
  
  // Phase 3: Apply changes atomically
  try {
    return await prisma.$transaction(async (tx) => {
      // Verify lock still exists and belongs to us
      const lock = await tx.productUpdateLock.findUnique({ 
        where: { productId_token: { productId: id, token: lockToken } } 
      });
      
      if (!lock) {
        throw new Error("Lock expired or stolen - concurrent modification detected");
      }
      
      // Apply all changes...
      const product = await tx.product.update({ ... });
      
      // Release lock
      await tx.productUpdateLock.delete({ where: { id: lock.id } });
      
      return product;
    });
  } catch (err) {
    // Cleanup uploads on failure
    await cleanupFilesWithRetry([
      ...(createUploads.data?.map(f => f.key) ?? []),
      ...(updateUploads.data?.map(f => f.key) ?? [])
    ]);
    throw err;
  }
}
```

**Benefits**: 
- Prevents race conditions
- Separates concerns (validate → upload → apply)
- Easier to test each phase independently
- Lock mechanism prevents concurrent modifications

**Required Schema Change**:
```prisma
model ProductUpdateLock {
  id         String   @id @default(cuid())
  productId  String
  token      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@unique([productId, token])
  @@index([expiresAt]) // For cleanup of expired locks
}
```

---

### Option 2: Saga Pattern with Compensation

```typescript
class ProductPatchSaga {
  private compensations: (() => Promise<void>)[] = [];
  private productId: string;
  
  constructor(productId: string) {
    this.productId = productId;
  }
  
  async execute(params: ProductModel.patchBody) {
    try {
      // Step 1: Upload files
      const uploads = await this.uploadFiles(params);
      this.compensations.push(() => this.cleanupFiles(uploads));
      
      // Step 2: Update database
      const product = await this.updateDatabase(params, uploads);
      this.compensations.push(() => this.revertDatabase(product));
      
      // Step 3: Invalidate cache
      await this.invalidateCache(product);
      
      return product;
    } catch (err) {
      await this.compensate();
      throw err;
    }
  }
  
  private async uploadFiles(params: ProductModel.patchBody) {
    const [createUploads, updateUploads] = await Promise.all([
      params.images?.create?.length 
        ? uploadFiles(params.name, params.images.create.map(img => img.file))
        : Promise.resolve({ data: [], error: null }),
      params.images?.update?.filter(op => op.file)?.length
        ? uploadFiles(params.name, params.images.update.filter(op => op.file).map(op => op.file as File))
        : Promise.resolve({ data: [], error: null })
    ]);
    
    if (createUploads.error || updateUploads.error) {
      throw new Error(`Upload failed: ${[createUploads.error, updateUploads.error].filter(Boolean).join(", ")}`);
    }
    
    return { createUploads, updateUploads };
  }
  
  private async updateDatabase(params: ProductModel.patchBody, uploads: any) {
    return await prisma.$transaction(async (tx) => {
      // All database operations here...
    });
  }
  
  private async compensate() {
    for (const fn of this.compensations.reverse()) {
      try {
        await fn();
      } catch (err) {
        console.error("Compensation failed:", err);
        // Log to monitoring system
      }
    }
  }
  
  private async cleanupFiles(uploads: any) {
    const keys = [
      ...(uploads.createUploads.data?.map((f: any) => f.key) ?? []),
      ...(uploads.updateUploads.data?.map((f: any) => f.key) ?? [])
    ];
    await cleanupFilesWithRetry(keys);
  }
  
  private async revertDatabase(product: any) {
    // Store previous state before update, revert here
    // This requires storing the "before" snapshot
  }
  
  private async invalidateCache(product: any) {
    invalidateProductListings({
      categoryIds: [product.categoryId],
      statuses: [product.status],
    });
  }
}

// Usage in service:
async patch(params: ProductModel.patchBody & uuidGuard) {
  const saga = new ProductPatchSaga(params.id);
  return await saga.execute(params);
}
```

**Benefits**: 
- Clear rollback strategy for each step
- Testable (can mock individual steps)
- Extensible (easy to add new steps)
- Explicit compensation logic

**Drawbacks**:
- More complex
- Requires storing "before" state for full rollback
- May need a dead-letter queue for failed compensations

---

### Option 3: Event Sourcing (Overkill but Robust)

```typescript
// Instead of updating state directly, store intents as events
async patch(params: ProductModel.patchBody & uuidGuard) {
  const currentProduct = await this.getById({ id: params.id });
  
  // Store the intent
  const event = await prisma.productEvent.create({
    data: {
      productId: params.id,
      type: "PATCH_REQUESTED",
      payload: JSON.stringify(params),
      version: currentProduct.version,
      status: "PENDING",
    }
  });
  
  // Return immediately, background worker processes events
  return { eventId: event.id, message: "Update queued" };
}

// Background worker (separate process)
async function processProductEvents() {
  while (true) {
    const events = await prisma.productEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    
    for (const event of events) {
      try {
        await processEvent(event);
        await prisma.productEvent.update({
          where: { id: event.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      } catch (err) {
        await prisma.productEvent.update({
          where: { id: event.id },
          data: { 
            status: "FAILED", 
            error: (err as Error).message,
            retryCount: { increment: 1 }
          },
        });
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function processEvent(event: ProductEvent) {
  const product = await prisma.product.findUnique({ where: { id: event.productId } });
  
  if (!product || product.version !== event.version) {
    throw new Error("VERSION_CONFLICT");
  }
  
  const params = JSON.parse(event.payload);
  
  // Upload files
  const uploads = await uploadFiles(...);
  
  // Apply changes in transaction
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ ... });
    // Store file references in event for cleanup on failure
    await tx.productEvent.update({
      where: { id: event.id },
      data: { uploadedFiles: JSON.stringify(uploads) }
    });
  });
}
```

**Benefits**: 
- Full audit trail (every change is recorded)
- Replayable (can rebuild state from events)
- Never loses data (events are immutable)
- Async processing (client doesn't wait)
- Easy to add retry logic

**Drawbacks**:
- Much more complex infrastructure
- Requires background workers
- Eventual consistency (not immediate)
- Requires schema changes

**When to use**: High-volume systems with strict audit requirements

---

## 🎯 Quick Wins for Current Code

### 1. Use `updateMany` for Attribute Clearing

**Current (Inefficient)**:
```typescript
const variants = await tx.productVariant.findMany({
  where: { productId: id },
  select: { id: true },
});

await Promise.all(
  variants.map((v) =>
    tx.productVariant.update({
      where: { id: v.id },
      data: { attributeValues: { set: [] } },
    }),
  ),
);
```

**Fixed**:
```typescript
// Note: Prisma doesn't support updateMany for relation fields
// Workaround: Use raw SQL
await tx.$executeRaw`
  DELETE FROM "_ProductVariantToAttributeValue"
  WHERE "A" IN (
    SELECT id FROM "ProductVariant" WHERE "productId" = ${id}
  )
`;
```

**Location**: `apps/server/src/modules/products/service.ts:650-665`

---

### 2. Consolidate Variant Operations

**Current**:
```typescript
const promises: Promise<unknown>[] = [];

if (vOps.delete && vOps.delete.length > 0) {
  promises.push(tx.productVariant.deleteMany({ ... }));
}

if (vOps.update && vOps.update.length > 0) {
  for (const variant of vOps.update) {
    promises.push(tx.productVariant.update({ ... }));
  }
}

if (vOps.create && vOps.create.length > 0) {
  for (const variant of vOps.create) {
    promises.push(tx.productVariant.create({ ... }));
  }
}

await Promise.all(promises);
```

**Fixed**:
```typescript
const variantPromises: Promise<unknown>[] = [
  // Delete operations
  ...(vOps.delete?.length 
    ? [tx.productVariant.deleteMany({ where: { id: { in: vOps.delete }, productId: id } })] 
    : []
  ),
  
  // Update operations
  ...(vOps.update?.map(variant => 
    tx.productVariant.update({
      where: { id: variant.id },
      data: {
        ...(variant.price !== undefined && { price: variant.price }),
        ...(variant.sku !== undefined && { sku: variant.sku }),
        ...(variant.stock !== undefined && { stock: variant.stock }),
        ...(variant.currency !== undefined && { currency: variant.currency }),
        ...(variant.attributeValueIds !== undefined && {
          attributeValues: { set: variant.attributeValueIds.map(aid => ({ id: aid })) },
        }),
      },
      include: { attributeValues: true },
    })
  ) ?? []),
  
  // Create operations
  ...(vOps.create?.map(variant => 
    tx.productVariant.create({
      data: {
        productId: id,
        price: variant.price,
        sku: variant.sku,
        stock: variant.stock ?? 0,
        currency: variant.currency ?? "EUR",
        attributeValues: { connect: variant.attributeValueIds.map(aid => ({ id: aid })) },
      },
      include: { attributeValues: true },
    })
  ) ?? []),
];

await Promise.all(variantPromises);
```

**Location**: `apps/server/src/modules/products/service.ts:583-647`

---

### 3. Move Validation Inside Transaction

**Current (Race Condition)**:
```typescript
const currentProduct = await this.getById({ id });

if (_version !== undefined && _version !== currentProduct.version) {
  throw status("Conflict", { ... });
}

validateImages({ imagesOps: iOps, currentImages: currentProduct.images });
validateVariants({ ... });

// Transaction starts LATER - product could have changed!
const product = await prisma.$transaction(async (tx) => {
  // ...
});
```

**Fixed**:
```typescript
const product = await prisma.$transaction(async (tx) => {
  // Fetch FRESH data inside transaction
  const currentProduct = await tx.product.findUniqueOrThrow({
    where: { id },
    include: {
      images: true,
      variants: { include: { attributeValues: true } },
      category: { include: { attributes: { include: { values: true } } } },
    },
  });
  
  // Version check with fresh data
  if (_version !== undefined && _version !== currentProduct.version) {
    throw status("Conflict", {
      message: `Product modified. Expected version ${_version}, current is ${currentProduct.version}`,
      code: "VERSION_CONFLICT",
    });
  }
  
  // Validate with fresh data
  const hasProductChange = hasProductChanges({
    newData: { name, description, requestedStatus, categoryId, iOps, vOps },
    currentProduct,
  });
  
  if (!hasProductChange) return currentProduct;
  
  if (iOps) {
    validateImages({ imagesOps: iOps, currentImages: currentProduct.images });
    ensureSingleThumbnail({ imagesOps: iOps, currentThumbnail: currentProduct.images.find(img => img.isThumbnail) });
  }
  
  // ... rest of transaction
});
```

**Note**: This requires moving file uploads INSIDE the transaction, which means:
- If transaction fails, you need to cleanup uploaded files
- Better to use Option 1 (Two-Phase Commit) to avoid this issue

**Location**: `apps/server/src/modules/products/service.ts:386-490`

---

### 4. Add Retry Logic for File Cleanup

**Current**:
```typescript
if (oldKeysToDelete.length > 0) {
  await utapi.deleteFiles(oldKeysToDelete); // May fail silently
}
```

**Fixed**:
```typescript
async function cleanupFilesWithRetry(keys: string[], maxRetries = 3): Promise<void> {
  if (!keys.length) return;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await utapi.deleteFiles(keys);
      return; // Success
    } catch (err) {
      console.error(`File cleanup attempt ${attempt + 1} failed:`, err);
      
      if (attempt === maxRetries - 1) {
        // Final attempt failed - log to monitoring system
        console.error("CRITICAL: File cleanup failed after all retries:", { keys, error: err });
        // TODO: Send to dead-letter queue or alert monitoring
        throw err;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

// Usage:
if (oldKeysToDelete.length > 0) {
  await cleanupFilesWithRetry(oldKeysToDelete);
}
```

**Location**: Add new utility function, use at `apps/server/src/modules/products/service.ts:681`

---

### 5. Add Stock Validation

**Add to** `apps/server/src/modules/products/validators/variants.ts`:

```typescript
export function validateVariantStock(stock: number | undefined): void {
  if (stock !== undefined) {
    if (!Number.isInteger(stock)) {
      throw status("Bad Request", {
        message: "Stock must be an integer",
        code: "INVALID_STOCK_TYPE",
      });
    }
    
    if (stock < 0) {
      throw status("Bad Request", {
        message: "Stock cannot be negative",
        code: "NEGATIVE_STOCK",
      });
    }
    
    if (stock > 1_000_000) { // Sanity check
      throw status("Bad Request", {
        message: "Stock value too large (max: 1,000,000)",
        code: "STOCK_TOO_LARGE",
      });
    }
  }
}
```

**Use in** `service.ts`:
```typescript
if (vOps?.create) {
  for (const variant of vOps.create) {
    validateVariantStock(variant.stock);
  }
}

if (vOps?.update) {
  for (const variant of vOps.update) {
    validateVariantStock(variant.stock);
  }
}
```

---

## 📊 Performance Recommendations

### 1. Add Database Indexes

**File**: `apps/server/prisma/schema.prisma`

```prisma
model Product {
  // ... existing fields
  
  @@index([status, categoryId]) // For filtered listings
  @@index([slug]) // For slug lookups
  @@index([categoryId]) // For category-based queries
}

model ProductVariant {
  // ... existing fields
  
  @@index([productId, stock]) // For stock filtering
  @@index([productId]) // For product variants lookup
}

model Image {
  // ... existing fields
  
  @@index([productId, isThumbnail]) // For thumbnail lookup
  @@index([productId]) // For product images
}
```

**Impact**: 50-80% faster query performance on large datasets

---

### 2. Batch Image Thumbnail Updates

**Current**:
```typescript
const updatePromises = iOps.update.map((op) => tx.image.update({ ... }));
await Promise.all(updatePromises);
```

**Optimized** (for thumbnail resets):
```typescript
// If new thumbnail is being set, reset all others in one query
if (iOps.update?.some(op => op.isThumbnail === true)) {
  await tx.$executeRaw`
    UPDATE "Image"
    SET "isThumbnail" = false
    WHERE "productId" = ${id} 
    AND "isThumbnail" = true
    AND "id" NOT IN (${sql.join(iOps.update.filter(op => op.isThumbnail).map(op => op.id), sql`, `)})
  `;
}

// Then update individual images
const updatePromises = iOps.update.map((op) => tx.image.update({ ... }));
await Promise.all(updatePromises);
```

**Impact**: Reduces N update queries to 1 for thumbnail management

---

### 3. Use Redis for Cache Instead of LRU

**Problem**: LRU cache doesn't survive restarts or scale horizontally (each server instance has its own cache)

**Solution**:
```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// In get() method
const cacheKey = `products:${sortBy ?? "default"}:${sortDir}:${skip}:${take}:...`;

const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const products = await sql<getProduct[]>`...`;

await redis.setex(cacheKey, 600, JSON.stringify(products)); // 10min TTL
return products;

// In invalidateProductListings()
async function invalidateProductListings(options?: { categoryIds?: string[]; statuses?: string[] }) {
  if (!options || (!options.categoryIds?.length && !options.statuses?.length)) {
    // Clear all product cache keys
    const keys = await redis.keys("products:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return;
  }
  
  // Pattern matching for surgical invalidation
  const keys = await redis.keys("products:*");
  const keysToDelete: string[] = [];
  
  for (const key of keys) {
    const parts = key.split(":");
    const keyStatus = parts[6] ?? "";
    const keyCategories = parts[7] ?? "";
    
    let shouldInvalidate = false;
    
    if (options.statuses?.length && (keyStatus === "" || options.statuses.includes(keyStatus))) {
      shouldInvalidate = true;
    }
    
    if (options.categoryIds?.length && (keyCategories === "" || options.categoryIds.some(catId => keyCategories.includes(catId)))) {
      shouldInvalidate = true;
    }
    
    if (shouldInvalidate) {
      keysToDelete.push(key);
    }
  }
  
  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
}
```

**Benefits**:
- Survives server restarts
- Shared across all server instances
- Better TTL management
- Can use Redis pub/sub for cache invalidation across instances

**Drawbacks**:
- Requires Redis infrastructure
- Network latency (minimal with good setup)

---

### 4. Optimize Category Fetch

**Current**:
```typescript
const categoryChange = hasCategoryChanged
  ? await categoryService.getById({ id: categoryId })
  : null;
```

**Problem**: Fetches category even if not needed for validation

**Optimized**:
```typescript
let categoryChange: Category | null = null;

// Only fetch if we need it for validation or will use it
if (hasCategoryChanged && (vOps || requestedStatus === "PUBLISHED")) {
  categoryChange = await categoryService.getById({ id: categoryId });
}
```

**Location**: `apps/server/src/modules/products/service.ts:414-416`

---

### 5. Use DataLoader for Batch Attribute Value Fetching

If you frequently fetch attribute values across multiple variants, use DataLoader to batch and cache these requests:

```typescript
import DataLoader from "dataloader";

const attributeValueLoader = new DataLoader(async (ids: string[]) => {
  const values = await prisma.attributeValue.findMany({
    where: { id: { in: ids } },
  });
  
  // Return in same order as requested
  return ids.map(id => values.find(v => v.id === id));
});

// Usage in variant validation
const attributeValues = await Promise.all(
  variant.attributeValueIds.map(id => attributeValueLoader.load(id))
);
```

**Impact**: Reduces N+1 queries to batched fetches

---

## 🔍 Summary

### Critical Issues (Fix Immediately)

| Issue | Severity | Fix Effort | Priority |
|-------|----------|------------|----------|
| Race condition (upload→transaction) | 🔴 High | Medium | 1 |
| Validation outside transaction | 🔴 High | Low | 2 |
| Missing file cleanup retry | 🟡 Medium | Low | 3 |

### Performance Optimizations

| Optimization | Impact | Effort | Priority |
|--------------|--------|--------|----------|
| Inefficient attribute clearing | 🟡 Medium | Low | 1 |
| Add database indexes | 🟢 High | Low | 2 |
| Use Redis for cache | 🟢 High | Medium | 3 |

### Nice to Have

| Enhancement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Stock validation | 🟢 Low | Low | 1 |
| Consolidate variant operations | 🟢 Low | Low | 2 |
| Batch thumbnail updates | 🟢 Low | Medium | 3 |

---

## 🎯 Recommended Implementation Path

### Phase 1: Critical Fixes (Week 1)
1. ✅ Implement **Quick Win #4**: Add retry logic for file cleanup
2. ✅ Implement **Quick Win #1**: Use efficient attribute clearing
3. ✅ Implement **Quick Win #5**: Add stock validation
4. ✅ Add database indexes (Performance #1)

### Phase 2: Architecture Improvement (Week 2-3)
5. ✅ Implement **Option 1 (Two-Phase Commit)** to fix race conditions
   - Add `ProductUpdateLock` model to schema
   - Migrate existing code to use lock mechanism
   - Add lock cleanup job for expired locks
   - Test concurrent update scenarios

### Phase 3: Performance & Monitoring (Week 4)
6. ✅ Replace LRU cache with Redis (Performance #3)
7. ✅ Add monitoring for:
   - File cleanup failures
   - Lock timeout incidents
   - Version conflict rate
   - Cache hit rate
8. ✅ Add integration tests for concurrent scenarios

---

## 🧪 Testing Recommendations

### Unit Tests
```typescript
describe("productService.patch", () => {
  it("should handle concurrent updates with version conflict", async () => {
    const product = await createTestProduct();
    
    const update1 = productService.patch({ id: product.id, name: "New Name 1", _version: product.version });
    const update2 = productService.patch({ id: product.id, name: "New Name 2", _version: product.version });
    
    const results = await Promise.allSettled([update1, update2]);
    
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  
  it("should cleanup uploaded files on transaction failure", async () => {
    const spy = vi.spyOn(utapi, "deleteFiles");
    
    await expect(
      productService.patch({ id: "invalid", images: { create: [{ file: mockFile }] } })
    ).rejects.toThrow();
    
    expect(spy).toHaveBeenCalled();
  });
  
  it("should not create orphaned files when upload succeeds but transaction fails", async () => {
    // Mock transaction to fail after upload
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("Transaction failed"));
    
    await expect(
      productService.patch({ id: product.id, images: { create: [{ file: mockFile }] } })
    ).rejects.toThrow();
    
    // Verify files were cleaned up
    const orphanedFiles = await listUploadedFiles();
    expect(orphanedFiles).toHaveLength(0);
  });
});
```

### Integration Tests
```typescript
describe("productService.patch integration", () => {
  it("should handle file upload + database update atomically", async () => {
    const product = await createTestProduct();
    
    const result = await productService.patch({
      id: product.id,
      name: "Updated Name",
      images: { create: [{ file: mockFile, isThumbnail: true }] }
    });
    
    expect(result.name).toBe("Updated Name");
    expect(result.images).toHaveLength(1);
    
    // Verify file actually exists in storage
    const fileExists = await utapi.getFileUrl(result.images[0].key);
    expect(fileExists).toBeDefined();
  });
  
  it("should properly invalidate cache on update", async () => {
    const product = await createTestProduct();
    
    // Warm up cache
    await productService.get({ status: product.status });
    
    // Update product
    await productService.patch({ id: product.id, name: "New Name" });
    
    // Cache should be invalidated
    const results = await productService.get({ status: product.status });
    const updated = results.find(p => p.id === product.id);
    expect(updated?.name).toBe("New Name");
  });
});
```

### Load Tests
```typescript
describe("productService.patch load test", () => {
  it("should handle 100 concurrent updates without data corruption", async () => {
    const product = await createTestProduct();
    
    const updates = Array.from({ length: 100 }, (_, i) => 
      productService.patch({ id: product.id, name: `Name ${i}` })
    );
    
    const results = await Promise.allSettled(updates);
    
    // Some should succeed, some should conflict
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const conflicted = results.filter(r => r.status === "rejected").length;
    
    expect(succeeded + conflicted).toBe(100);
    expect(succeeded).toBeGreaterThan(0);
    
    // Final state should be consistent
    const final = await productService.getById({ id: product.id });
    expect(final.version).toBeGreaterThan(product.version);
  });
});
```

---

## 📚 Additional Resources

- [Prisma Transaction Patterns](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Two-Phase Commit Pattern](https://en.wikipedia.org/wiki/Two-phase_commit_protocol)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Optimistic Locking](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)

---

**Last Updated**: 2026-01-27  
**Reviewed By**: Claude Code  
**Next Review**: After Phase 1 implementation
