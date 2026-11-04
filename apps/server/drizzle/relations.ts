import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

const tables = {
  attributeValueToProductVariant: schema.attributeValueToProductVariantTable,
  prismaMigrations: schema.prismaMigrationsTable,
  account: schema.accountTable,
  attribute: schema.attributeTable,
  attributeValue: schema.attributeValueTable,
  category: schema.categoryTable,
  comment: schema.commentTable,
  image: schema.imageTable,
  order: schema.orderTable,
  orderItem: schema.orderItemTable,
  product: schema.productTable,
  productVariant: schema.productVariantTable,
  session: schema.sessionTable,
  user: schema.userTable,
  verification: schema.verificationTable,
  verificationToken: schema.verificationTokenTable,
};

export const relations = defineRelations(tables, (r) => ({
  attributeValue: {
    productVariants: r.many.productVariant({
      from: r.attributeValue.id.through(r.attributeValueToProductVariant.a),
      to: r.productVariant.id.through(r.attributeValueToProductVariant.b),
    }),
    attributeValueToProductVariants: r.many.attributeValueToProductVariant(),
    attribute: r.one.attribute({
      from: r.attributeValue.attributeId,
      to: r.attribute.id,
    }),
  },
  productVariant: {
    attributeValues: r.many.attributeValue(),
    attributeValueToProductVariants: r.many.attributeValueToProductVariant(),
    orders: r.many.order(),
    orderItems: r.many.orderItem(),
    product: r.one.product({
      from: r.productVariant.productId,
      to: r.product.id,
    }),
  },
  attributeValueToProductVariant: {
    attributeValue: r.one.attributeValue({
      from: r.attributeValueToProductVariant.a,
      to: r.attributeValue.id,
    }),
    productVariant: r.one.productVariant({
      from: r.attributeValueToProductVariant.b,
      to: r.productVariant.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  user: {
    accounts: r.many.account(),
    products: r.many.product(),
    comments: r.many.comment(),
    orders: r.many.order(),
    sessions: r.many.session(),
  },
  attribute: {
    category: r.one.category({
      from: r.attribute.categoryId,
      to: r.category.id,
      optional: false,
    }),
    values: r.many.attributeValue(),
  },
  category: {
    attributes: r.many.attribute(),
    image: r.one.image({
      from: r.category.imageId,
      to: r.image.id,
      optional: false,
    }),
    products: r.many.product(),
  },
  image: {
    categories: r.one.category(),
    product: r.one.product({
      from: r.image.productId,
      to: r.product.id,
    }),
  },
  product: {
    users: r.many.user({
      from: r.product.id.through(r.comment.productId),
      to: r.user.id.through(r.comment.userId),
    }),
    comments: r.many.comment(),
    images: r.many.image(),
    category: r.one.category({
      from: r.product.categoryId,
      to: r.category.id,
    }),
    productVariants: r.many.productVariant(),
  },
  comment: {
    product: r.one.product({
      from: r.comment.productId,
      to: r.product.id,
    }),
    user: r.one.user({
      from: r.comment.userId,
      to: r.user.id,
    }),
  },
  order: {
    user: r.one.user({
      from: r.order.userId,
      to: r.user.id,
    }),
    productVariants: r.many.productVariant({
      from: r.order.id.through(r.orderItem.orderId),
      to: r.productVariant.id.through(r.orderItem.variantId),
    }),
    orderItems: r.many.orderItem(),
  },
  orderItem: {
    order: r.one.order({
      from: r.orderItem.orderId,
      to: r.order.id,
    }),
    productVariant: r.one.productVariant({
      from: r.orderItem.variantId,
      to: r.productVariant.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
}));
