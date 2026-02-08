/*
  Migration: Change monetary fields from Float (DoublePrecision) to Int (cents)
  - Converts existing data by multiplying by 100 (e.g., 19.99 → 1999)
  - All monetary values now stored as integer cents for exact arithmetic
*/

-- Convert Order monetary amounts to cents
ALTER TABLE "Order"
  ALTER COLUMN "shippingAmount" SET DEFAULT 0,
  ALTER COLUMN "shippingAmount" TYPE INTEGER USING ("shippingAmount" * 100)::INTEGER,
  ALTER COLUMN "subtotalAmount" TYPE INTEGER USING ("subtotalAmount" * 100)::INTEGER,
  ALTER COLUMN "taxAmount" SET DEFAULT 0,
  ALTER COLUMN "taxAmount" TYPE INTEGER USING ("taxAmount" * 100)::INTEGER,
  ALTER COLUMN "totalAmount" TYPE INTEGER USING ("totalAmount" * 100)::INTEGER;

-- Convert OrderItem monetary amounts to cents
ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPrice" TYPE INTEGER USING ("unitPrice" * 100)::INTEGER,
  ALTER COLUMN "totalPrice" TYPE INTEGER USING ("totalPrice" * 100)::INTEGER;

-- Convert ProductVariant price to cents
ALTER TABLE "ProductVariant"
  ALTER COLUMN "price" TYPE INTEGER USING ("price" * 100)::INTEGER;
