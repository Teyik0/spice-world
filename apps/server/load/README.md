# Load Scripts

Scripts for populating the database with test data.

## Scripts

### `seed.data.ts`

Generates fake e-commerce data using Faker.js.

**What it creates:**
- 100,000 products with unique names and slugs
- 10 categories with 2-3 attributes each
- 5 variants per product with random attribute values
- 2 images per product (thumbnail + regular)
- Random stock levels and prices

**Performance:**
- Batch size: 1,000 products per batch
- Expected time: ~15-20 minutes for 100k products
- Uses `createMany` for bulk inserts + transactions for relations

**Usage:**
```bash
bun run load/seed.data.ts
```

**Configuration:**
Edit constants in the file to adjust:
- `NUM_PRODUCTS`: Total products to generate (default: 100,000)
- `VARIANTS_PER_PRODUCT`: Variants per product (default: 5)
- `BATCH_SIZE`: Products per batch (default: 1,000)

### `load.test.ts`

Load testing suite using Bombardier for API performance benchmarking.

**What it tests:**
- `/products` endpoint under high load
- `/products?sortBy=priceMin` with sorting
- `/categories` and `/attributes` endpoints
- Stress test with 500 concurrent connections

**Metrics measured:**
- RPS (Requests per second)
- Latency percentiles (p50, p95, p99)
- Success/error rates

**Usage:**
```bash
bun test load/load.test.ts
```

**Requirements:**
- `bombardier` installed: `brew install bombardier` (macOS)
- Server running on port 3001

**Note:** Test database setup/teardown is currently disabled (commented out).
