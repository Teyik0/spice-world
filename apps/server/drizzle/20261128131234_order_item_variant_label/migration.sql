UPDATE "OrderItem" AS item
SET "variantName" = (
  SELECT string_agg(value."value", ' · ' ORDER BY value."id")
  FROM "_AttributeValueToProductVariant" AS link
  JOIN "AttributeValue" AS value ON value."id" = link."A"
  WHERE link."B" = item."variantId"
)
WHERE item."variantId" IS NOT NULL;
