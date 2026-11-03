-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "ProductStatus" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "ShippingStatus" AS ENUM('PENDING', 'SHIPPED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "OrderStatus" AS ENUM('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "_AttributeValueToProductVariant" (
	"A" text,
	"B" text,
	CONSTRAINT "_AttributeValueToProductVariant_AB_pkey" PRIMARY KEY("A","B")
);
--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp(3),
	"refreshTokenExpiresAt" timestamp(3),
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp(3) NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Attribute" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"categoryId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AttributeValue" (
	"id" text PRIMARY KEY,
	"value" text NOT NULL,
	"attributeId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Category" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"imageId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Comment" (
	"id" text PRIMARY KEY,
	"text" text NOT NULL,
	"productId" text NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Image" (
	"id" text PRIMARY KEY,
	"altText" text,
	"isThumbnail" boolean DEFAULT false NOT NULL,
	"productId" text,
	"keyThumb" text NOT NULL,
	"keyMedium" text NOT NULL,
	"keyLarge" text NOT NULL,
	"urlThumb" text NOT NULL,
	"urlMedium" text NOT NULL,
	"urlLarge" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Order" (
	"id" text PRIMARY KEY,
	"status" "OrderStatus" DEFAULT 'PENDING'::"OrderStatus" NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"metadata" jsonb,
	"stripeSessionId" text NOT NULL,
	"stripePaymentIntentId" text,
	"shippingAddress" jsonb,
	"shippingAmount" integer DEFAULT 0 NOT NULL,
	"shippingStatus" "ShippingStatus" DEFAULT 'PENDING'::"ShippingStatus" NOT NULL,
	"subtotalAmount" integer NOT NULL,
	"taxAmount" integer DEFAULT 0 NOT NULL,
	"totalAmount" integer NOT NULL,
	"trackingNumber" text
);
--> statement-breakpoint
CREATE TABLE "OrderItem" (
	"id" text PRIMARY KEY,
	"orderId" text NOT NULL,
	"productId" text NOT NULL,
	"productName" text NOT NULL,
	"productImage" text,
	"variantId" text,
	"variantName" text,
	"variantSku" text,
	"unitPrice" integer NOT NULL,
	"quantity" integer NOT NULL,
	"totalPrice" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Product" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"status" "ProductStatus" DEFAULT 'DRAFT'::"ProductStatus" NOT NULL,
	"categoryId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductVariant" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"sku" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"impersonatedBy" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text,
	"email" text,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"banned" boolean,
	"banReason" text,
	"banExpires" timestamp(3),
	"stripeCustomerId" text
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"createdAt" timestamp(3),
	"updatedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "VerificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "_AttributeValueToProductVariant_B_index" ON "_AttributeValueToProductVariant" ("B");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "Attribute_categoryId_name_key" ON "Attribute" ("categoryId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "AttributeValue_attributeId_value_key" ON "AttributeValue" ("attributeId","value");--> statement-breakpoint
CREATE UNIQUE INDEX "Category_imageId_key" ON "Category" ("imageId");--> statement-breakpoint
CREATE UNIQUE INDEX "Category_name_key" ON "Category" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "Image_keyLarge_key" ON "Image" ("keyLarge");--> statement-breakpoint
CREATE UNIQUE INDEX "Image_keyMedium_key" ON "Image" ("keyMedium");--> statement-breakpoint
CREATE UNIQUE INDEX "Image_keyThumb_key" ON "Image" ("keyThumb");--> statement-breakpoint
CREATE INDEX "Image_productId_isThumbnail_idx" ON "Image" ("productId","isThumbnail");--> statement-breakpoint
CREATE INDEX "Order_createdAt_idx" ON "Order" ("createdAt");--> statement-breakpoint
CREATE INDEX "Order_status_idx" ON "Order" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order" ("stripePaymentIntentId");--> statement-breakpoint
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order" ("stripeSessionId");--> statement-breakpoint
CREATE INDEX "Order_userId_idx" ON "Order" ("userId");--> statement-breakpoint
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");--> statement-breakpoint
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem" ("productId");--> statement-breakpoint
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem" ("variantId");--> statement-breakpoint
CREATE INDEX "Product_categoryId_idx" ON "Product" ("categoryId");--> statement-breakpoint
CREATE INDEX "Product_name_fts_idx" ON "Product" USING gin (to_tsvector('french'::regconfig, name));--> statement-breakpoint
CREATE UNIQUE INDEX "Product_name_key" ON "Product" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "Product_slug_key" ON "Product" ("slug");--> statement-breakpoint
CREATE INDEX "Product_status_idx" ON "Product" ("status");--> statement-breakpoint
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant" ("productId");--> statement-breakpoint
CREATE INDEX "ProductVariant_productId_stock_price_idx" ON "ProductVariant" ("productId","stock","price");--> statement-breakpoint
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant" ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" ("token");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "user" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_stripeCustomerId_key" ON "user" ("stripeCustomerId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken" ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken" ("token");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Image" ADD CONSTRAINT "Image_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_AttributeValueToProductVariant" ADD CONSTRAINT "_AttributeValueToProductVariant_A_fkey" FOREIGN KEY ("A") REFERENCES "AttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_AttributeValueToProductVariant" ADD CONSTRAINT "_AttributeValueToProductVariant_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
*/