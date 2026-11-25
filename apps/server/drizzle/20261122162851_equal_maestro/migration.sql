ALTER TABLE "Attribute" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "Attribute" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "AttributeValue" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "AttributeValue" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "CollectionProduct" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "CollectionProduct" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "Collection" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "Collection" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "Image" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "Image" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD COLUMN "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD COLUMN "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;