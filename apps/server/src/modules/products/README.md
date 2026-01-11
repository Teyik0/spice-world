# Module Products

## Architecture

```
products/
  |-- service.ts          # Main orchestration
  |-- model.ts            # TypeBox schemas
  |-- index.ts            # Elysia routes
  |-- validators/
  |     |-- index.ts      # Exports
  |     |-- publish.ts    # PUB1, PUB2 rules, auto-draft
  |     |-- variants.ts   # Variant attribute validations
  |     |-- images.ts     # Image operations validation
  |-- operations/
  |     |-- index.ts      # Exports
  |     |-- images.ts     # CRUD images (transaction)
  |     |-- variants.ts   # CRUD variants (transaction)
  |-- __tests__/
  |     |-- validators.test.ts  # Validator unit tests
```

## Error Codes

### Publication (Existing)

| Code | HTTP | Description |
|------|------|-------------|
| PUB1 | 400 | Cannot publish: no variant with price > 0 |
| PUB2 | 400 | Cannot publish: variants missing attribute values OR too many variants for no-attribute category |

### Validate Variant Attributes (VVA)

| Code | HTTP | Description |
|------|------|-------------|
| VVA1 | 400 | Invalid attribute values for variant (wrong category) |
| VVA2 | 400 | Multiple values for same attribute in variant |
| **VVA3** | **400** | **Product has more variants than category's attribute combinations allow** |
| **VVA4** | **400** | **Duplicate attribute combination found across variants** |
| **VVA5** | **400** | **Category change capacity insufficient for existing variants** |
| VARIANT_NOT_FOUND | 404 | Variant ID not found in product |
| INSUFFICIENT_VARIANTS | 400 | Product must have at least 1 variant |

### Validate Image Operations (VIO)

| Code | HTTP | Description |
|------|------|-------------|
| VIO1 | 400 | Duplicate fileIndex in imagesOps.create |
| VIO2 | 400 | Multiple thumbnails in imagesOps.create |
| VIO3 | 400 | Duplicate fileIndex in imagesOps.update |
| VIO4 | 400 | Multiple thumbnails in imagesOps.update |
| VIO5 | 400 | fileIndex used in both create and update |
| VIO6 | 400 | Multiple thumbnails across create and update |
| VIO7 | 400 | fileIndex out of bounds |
| IMAGE_NOT_FOUND | 404 | Image ID not found in product |
| POST_MULTIPLE_THUMBNAILS | 400 | Only one thumbnail allowed at creation |

### Category Change

| Code | HTTP | Description |
|------|------|-------------|
| CATEGORY_CHANGE_REQUIRES_VARIANTS | 400 | Category change requires variant operations |
| CATEGORY_CHANGE_REQUIRES_DELETE_ALL | 400 | Must delete ALL existing variants when changing category |
| CATEGORY_CHANGE_REQUIRES_CREATE | 400 | Must create at least one new variant when changing category |
| CATEGORY_NOT_FOUND | 400 | Category ID not found |

### Other

| Code | HTTP | Description |
|------|------|-------------|
| Conflict | 409 | Version mismatch (optimistic locking) |

## Publication Rules

### PUB1: Minimum Price

A product can only be **PUBLISHED** if **at least one variant has price > 0**.

### PUB2: Attributes for Multiple Variants

- If the product has **>1 variant**, each variant **must** have attributeValues
- Corollary: A category **without attributes** can only have **1 variant** in PUBLISHED status
- In DRAFT: no restrictions (can have multiple variants without attributes)

### Auto-DRAFT on Category Change

When changing category:
- If >1 variant AND missing attributeValues → status forced to DRAFT
- Exception: 1 variant only → no auto-draft

### Auto-DRAFT on POST

When creating a product with `status: PUBLISHED`:
- If PUB1 or PUB2 rules are not met → status automatically set to DRAFT
- Frontend should display a warning to inform the user

## Variant Validation Rules

### VVA3: Maximum Variants per Category

- **Maximum variants = product of all attribute value counts**
- Example: Category with Weight(3 values) × Origin(2 values) = max 6 variants
- Applied to: POST, PATCH, bulkPatch
- Purpose: Prevent creating more variants than the category can logically accommodate

### VVA4: No Duplicate Combinations

- No variant can have the exact same attributeValue combination
- AttributeValue IDs are sorted for consistent comparison regardless of order
- Applied to: POST, PATCH
- Purpose: Ensure each variant represents a unique product variation

### VVA5: Category Change Capacity

- When changing category, verify that existing variants fit in the new category
- If too many variants for the new category → throw 400 error (VVA5)
- Exception: If auto-draft is activated, no error (allows product to be saved in DRAFT)
- Applied to: PATCH, bulkPatch
- Purpose: Prevent moving products to categories that can't represent all variations

## Usage Cases

| Situation | Current Status | Action | Result |
|-----------|---------------|---------|---------|
| Create product with price=0 | - | POST status=PUBLISHED | Auto-DRAFT |
| Create product with price>0 | - | POST status=PUBLISHED | PUBLISHED |
| Create product price>0, 2 variants no attrs | - | POST status=PUBLISHED | Auto-DRAFT (PUB2) |
| Create too many variants | - | POST variants.create (×N) | REJECT (VVA3) |
| Create duplicate combination | - | POST variants.create duplicate | REJECT (VVA4) |
| Update price to 0 | PUBLISHED | PATCH price=0 | REJECT (PUB1) |
| Update price to 0 | PUBLISHED | PATCH price=0, status=DRAFT | OK → DRAFT |
| Update price to 0 | DRAFT | PATCH price=0 | OK |
| Add variant without attrs | PUBLISHED (1 variant) | PATCH create variant | REJECT (PUB2) |
| Add variant without attrs | DRAFT | PATCH create variant | OK |
| Delete only variant price>0 | PUBLISHED (2 variants) | PATCH delete variant | REJECT (PUB1) |
| Change category | PUBLISHED | PATCH categoryId | Auto-DRAFT if missing attrs |
| Change category | PUBLISHED (1 variant) | PATCH categoryId | OK (1 variant exception) |
| Change category, insufficient capacity | PUBLISHED | PATCH categoryId | REJECT (VVA5) |
| Publish 2 variants, category no attrs | DRAFT | PATCH status=PUBLISHED | REJECT (PUB2) |
| Publish 1 variant, category no attrs | DRAFT | PATCH status=PUBLISHED | OK |
| Bulk publish all valid | Multiple | bulkPatch status=PUBLISHED | All published (200) |
| Bulk publish one invalid | Multiple | bulkPatch status=PUBLISHED | All fail (400) |
| Bulk publish + category change | Multiple | bulkPatch {status: PUBLISHED, categoryId} | Auto-DRAFT all (no error) |
| Bulk partial failures | Multiple | bulkPatch with one VVA5 error | Partial 207, others OK |

## Validation Logic

### When to validate PUB1/PUB2?

```
IF (requested status == PUBLISHED) OR (current status == PUBLISHED AND no status change):
  - Calculate final variant state (after create/update/delete)
  - Validate PUB1: at least one variant with price > 0
  - Validate PUB2: if >1 variant, all must have attributeValues
  - IF validation fails → REJECT with 400 error

IF category change:
  - Verify if new variants have attributeValues
  - IF >1 variant AND missing attributeValues → force status = DRAFT (no error)
```

### When to validate VVA3/VVA4/VVA5?

```
POST:
  - VVA3: Check final variant count <= category max combinations
  - VVA4: Check no duplicate attributeValue combinations

PATCH:
  - VVA5: If changing category, check new category capacity
  - VVA3: Check final variant count <= category max combinations
  - VVA4: Check no duplicate attributeValue combinations (across all variants)

bulkPatch:
  - VVA5: For each product with category change, check new category capacity
  - PUB1/PUB2: For products with final status = PUBLISHED
```

## Bulk Operations

### Concurrency & Performance

- **Parallel validation**: Validates products in parallel with p-limit (concurrency: 15)
- **Fresh queries**: Category attributes fetched on-demand (no caching)
- **Atomic transaction**: All valid products updated in a single Prisma transaction

### Partial Success Handling

- **Response format**:
```typescript
{
  successes: string[],      // Product IDs that succeeded
  failed: Array<{
    id: string,
    name: string,
    code: string,          // e.g., "VVA5", "PUB1"
    error: string         // Detailed error message
  }>
}
```

- **HTTP Status Codes**:
  - `200`: All products succeeded
  - `207 Multi-Status`: Partial success (some failed, some succeeded)
  - `400`: All products failed

### Auto-Draft in Bulk Operations

When changing category + >1 variant + requesting PUBLISHED:
- Status automatically set to DRAFT (no error thrown)
- Applies to each product individually
- Only if all validations pass (VVA5, PUB1, PUB2)

### Clearing AttributeValues

When changing category in bulk:
- All attributeValues are cleared from all variants
- Products need reconfiguration with new category's attributes
- Handled in a single transaction with category update

## API Examples

### POST - Create a product

```typescript
// Successful publication
POST /products
{
  name: "Paprika",
  description: "...",
  categoryId: "cat-123",
  status: "PUBLISHED",
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["av-100g"] }
    ]
  },
  imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] }
}
// → Returns product with status: "PUBLISHED"

// Auto-draft (price = 0)
POST /products
{
  name: "Paprika",
  status: "PUBLISHED",
  variants: {
    create: [{ price: 0, attributeValueIds: [] }]
  }
}
// → Returns product with status: "DRAFT" (PUB1 not met)

// VVA3: Too many variants
POST /products
{
  categoryId: "cat-123",  // Category allows max 4 combinations
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["av-100g"] },
      { price: 6.99, attributeValueIds: ["av-250g"] },
      { price: 7.99, attributeValueIds: ["av-500g"] },
      { price: 8.99, attributeValueIds: ["av-1kg"] },
      { price: 9.99, attributeValueIds: ["av-1kg-ex"] }  // 5th variant
    ]
  }
}
// → 400 Bad Request { code: "VVA3", message: "Product has 5 variant(s), but category only allows 4 unique combination(s)" }

// VVA4: Duplicate combination
POST /products
{
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["av-red", "av-50g"] },
      { price: 6.99, attributeValueIds: ["av-50g", "av-red"] }  // Same combination
    ]
  }
}
// → 400 Bad Request { code: "VVA4", message: "Duplicate attribute combination found in variants new variant and new variant" }
```

### PATCH - Update a product

```typescript
// Update that breaks a PUBLISHED product → REJECTED
PATCH /products/prod-123
{
  variants: {
    update: [{ id: "var-1", price: 0 }]
  }
}
// → 400 Bad Request { code: "PUB1", message: "Cannot publish: at least one variant must have price > 0" }

// Update with explicit DRAFT request → OK
PATCH /products/prod-123
{
  status: "DRAFT",
  variants: {
    update: [{ id: "var-1", price: 0 }]
  }
}
// → OK, product set to DRAFT

// VVA5: Category change insufficient capacity
PATCH /products/prod-123
{
  categoryId: "cat-456"  // Category only allows 2 combinations
}
// Product has 3 variants
// → 400 Bad Request { code: "VVA5", message: "Cannot change category: product has 3 variant(s), but new category only allows 2 combination(s)" }
```

### PATCH /bulk - Bulk operations

```typescript
// Bulk publish all products
PATCH /products/bulk
{
  ids: ["prod-1", "prod-2", "prod-3"],
  status: "PUBLISHED"
}
// → 200 OK
// Response:
// {
//   successes: ["prod-1", "prod-2", "prod-3"],
//   failed: []
// }

// Bulk with partial failures
PATCH /products/bulk
{
  ids: ["prod-1", "prod-2", "prod-3"],
  categoryId: "cat-456"  // Some products don't fit
}
// → 207 Multi-Status
// Response:
// {
//   successes: ["prod-1", "prod-2"],
//   failed: [{
//     id: "prod-3",
//     name: "Product 3",
//     code: "VVA5",
//     error: "Cannot change category: product has 5 variant(s), but new category only allows 4 combination(s)"
//   }]
// }

// Bulk publish + category change with >1 variant → Auto-Draft
PATCH /products/bulk
{
  ids: ["prod-1"],
  status: "PUBLISHED",
  categoryId: "cat-456"  // Category change
}
// prod-1 has 2 variants
// → 200 OK
// Response:
// {
//   successes: ["prod-1"],
//   failed: []
// }
// Product is now DRAFT with cleared attributeValues
```

## Error Response Format

```typescript
{
  status: 400,
  data: null,
  error: {
    code: "VVA3",           // Specific error code
    message: "Product has 5 variant(s), but category only allows 4 unique combination(s)"
  }
}
```

## Detailed Validation Examples

### VVA3: Maximum Variants per Category

**Scenario 1: Single Attribute Category**
```
Category: "Spices"
  Attribute: "Weight" (values: 100g, 250g, 500g, 1kg)
  Max variants: 4

Product:
  variants: [
    { price: 5.99, attributeValueIds: ["100g"] },
    { price: 7.99, attributeValueIds: ["250g"] },
    { price: 9.99, attributeValueIds: ["500g"] },
    { price: 12.99, attributeValueIds: ["1kg"] }
  ]
Result: ✅ Valid (4 variants ≤ 4 max)
```

**Scenario 2: Multi-Attribute Category**
```
Category: "Spices"
  Attribute: "Weight" (values: 100g, 250g)
  Attribute: "Origin" (values: India, Sri Lanka, Madagascar)
  Max variants: 2 × 3 = 6

Product:
  variants: [
    { price: 5.99, attributeValueIds: ["100g", "India"] },
    { price: 6.99, attributeValueIds: ["100g", "Sri Lanka"] },
    { price: 7.99, attributeValueIds: ["100g", "Madagascar"] },
    { price: 8.99, attributeValueIds: ["250g", "India"] },
    { price: 9.99, attributeValueIds: ["250g", "Sri Lanka"] },
    { price: 10.99, attributeValueIds: ["250g", "Madagascar"] }
  ]
Result: ✅ Valid (6 variants ≤ 6 max)

// Add one more variant:
{ price: 11.99, attributeValueIds: ["500g", "India"] }
Result: ❌ VVA3 Error - "Product has 7 variant(s), but category only allows 6 unique combination(s)"
```

**API Call Example:**
```typescript
// VVA3 error in POST
POST /products
{
  name: "Paprika Powder",
  categoryId: "cat-123",  // 4 weight values
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["100g"] },
      { price: 7.99, attributeValueIds: ["250g"] },
      { price: 9.99, attributeValueIds: ["500g"] },
      { price: 11.99, attributeValueIds: ["1kg"] },
      { price: 13.99, attributeValueIds: ["2kg"] }  // ❌ 5th variant (too many)
    ]
  }
}
// Response: 400
// {
//   error: {
//     code: "VVA3",
//     message: "Product has 5 variant(s), but category only allows 4 unique combination(s)"
//   }
// }
```

### VVA4: Duplicate Attribute Combinations

**Scenario 1: Exact Duplicate IDs**
```
Category: "Spices"
  Attribute: "Weight" (values: 100g, 250g)

Product:
  variants: [
    { id: "var-1", price: 5.99, attributeValueIds: ["av-100g"] },
    { id: "var-2", price: 7.99, attributeValueIds: ["av-100g"] }  // ❌ Duplicate
  ]
Result: ❌ VVA4 Error - "Duplicate attribute combination found in variants var-1 and var-2"
```

**Scenario 2: Same Combination, Different Order**
```
Product:
  variants: [
    { id: "var-1", price: 5.99, attributeValueIds: ["av-red", "av-100g", "av-organic"] },
    { id: "var-2", price: 7.99, attributeValueIds: ["av-100g", "av-organic", "av-red"] }  // ❌ Same combo, different order
  ]
Result: ❌ VVA4 Error - Combination sorted internally, order doesn't matter
```

**Scenario 3: Valid Multi-Attribute Variants**
```
Category: "Spices"
  Attribute: "Weight" (100g, 250g)
  Attribute: "Origin" (India, Sri Lanka)
  Max variants: 4

Product:
  variants: [
    { price: 5.99, attributeValueIds: ["100g", "India"] },
    { price: 6.99, attributeValueIds: ["100g", "Sri Lanka"] },
    { price: 7.99, attributeValueIds: ["250g", "India"] },
    { price: 8.99, attributeValueIds: ["250g", "Sri Lanka"] }
  ]
Result: ✅ Valid (all unique combinations)
```

**API Call Example:**
```typescript
// VVA4 error in PATCH
PATCH /products/prod-123
{
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["av-100g", "av-india"] },
      { price: 6.99, attributeValueIds: ["av-india", "av-100g"] }  // ❌ Duplicate combination
    ]
  }
}
// Response: 400
// {
//   error: {
//     code: "VVA4",
//     message: "Duplicate attribute combination found in variants new variant and new variant"
//   }
// }
```

### VVA5: Category Change Capacity

**Scenario 1: Moving from Larger to Smaller Category**
```
Current Category: "Spices"
  Attribute: "Weight" (100g, 250g, 500g)
  Attribute: "Origin" (India, Sri Lanka, Madagascar)
  Max variants: 9

New Category: "Tea"
  Attribute: "Weight" (100g, 500g)
  Max variants: 2

Product:
  variants: [
    { id: "var-1", price: 5.99 },
    { id: "var-2", price: 7.99 },
    { id: "var-3", price: 9.99 }
  ]
Status: PUBLISHED

PATCH /products/prod-123
{ categoryId: "cat-tea" }
Result: ❌ VVA5 Error - "Cannot change category: product has 3 variant(s), but new category only allows 2 combination(s)"
```

**Scenario 2: Moving with Auto-Draft (Valid)**
```
Current Category: "Spices" (max: 9)
Product: 3 variants
Status: PUBLISHED

New Category: "Tea" (max: 2)

PATCH /products/prod-123
{
  categoryId: "cat-tea",
  status: "DRAFT"  // ✅ Explicit DRAFT, so no VVA5 error
}
Result: ✅ Valid - Product saved as DRAFT with cleared attributeValues
```

**Scenario 3: Bulk Operation - Partial Success**
```
Products to update:
  - Product A: 2 variants, moving to "Tea" (max: 2)  ✅
  - Product B: 3 variants, moving to "Tea" (max: 2)  ❌
  - Product C: 2 variants, moving to "Tea" (max: 2)  ✅

PATCH /products/bulk
{
  ids: ["prod-a", "prod-b", "prod-c"],
  categoryId: "cat-tea",
  status: "PUBLISHED"
}
Result: 207 Multi-Status (Partial success)
Response:
{
  successes: ["prod-a", "prod-c"],  // Valid products updated
  failed: [{
    id: "prod-b",
    name: "Product B",
    code: "VVA5",
    error: "Cannot change category: product has 3 variant(s), but new category only allows 2 combination(s)"
  }]
}
// prod-a and prod-c: Auto-drafted (status: "DRAFT")
// prod-b: Skipped (kept in original state)
```

**Scenario 4: Category Without Attributes**
```
Current Category: "Herbs"
  No attributes
  Max variants: 1

New Category: "Tea"
  Attribute: "Weight" (100g, 250g)
  Max variants: 2

Product:
  variants: [
    { id: "var-1", price: 5.99 }
  ]
Status: DRAFT

PATCH /products/prod-123
{ categoryId: "cat-tea" }
Result: ✅ Valid - 1 variant ≤ 2 max combinations
```

**API Call Examples:**
```typescript
// VVA5 error - insufficient capacity
PATCH /products/prod-123
{
  categoryId: "cat-herbs"  // Category allows max 1 variant
}
// Product has 3 variants
// Response: 400
// {
//   error: {
//     code: "VVA5",
//     message: "Cannot change category: product has 3 variant(s), but new category only allows 1 combination(s)"
//   }
// }

// VVA5 valid with auto-draft (bulk operation)
PATCH /products/bulk
{
  ids: ["prod-1", "prod-2"],
  categoryId: "cat-herbs",  // Category allows max 1 variant
  status: "PUBLISHED"
}
// Both products have 2 variants
// Response: 200 (Auto-draft applies)
// {
//   successes: ["prod-1", "prod-2"],
//   failed: []
// }
// Both products now: status="DRAFT", attributeValues=[]
```
