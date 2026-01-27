# Product POST/PATCH Requirements

This document outlines all requirements and validations for POST (create) and PATCH (update) operations on products.

| REQUIREMENT | DESCRIPTION | ERROR | SCOPE | FIELD | NOTES |
|-------------|-------------|-------|-------|-------|-------|
| **Schema - Name Required** | Name must be a non-empty string, 3+ chars, lowercase letters/spaces/accents | ElysiaValidationErr (422) | Both | name | Pattern: `/^[a-zà-ÿ][a-zà-ÿ ]*$/`. Auto-generates slug. |
| **Schema - Description Required** | Description must be non-empty string | ElysiaValidationErr (422) | Both | description | No length restrictions in schema, but required. |
| **Schema - CategoryId Required** | Must be valid UUID | ElysiaValidationErr (422) | Both | categoryId | Must exist in DB (separate validation). |
| **Schema - Status Required** | Must be 'DRAFT', 'PUBLISHED', or 'ARCHIVED' | ElysiaValidationErr (422) | Both | status | 'PUBLISHED' triggers additional validations. |
| **Schema - Variants Structure** | Must have create/update/delete arrays with proper structure | ElysiaValidationErr (422) | Both | variants | Each variant needs price, sku, attributeValueIds. |
| **Schema - Images Required** | Must provide 1-5 File objects | ElysiaValidationErr (422) | Both | images | File objects, not just metadata. |
| **Schema - ImagesOps Required** | Must have create/update/delete with fileIndex, isThumbnail, etc. | ElysiaValidationErr (422) | Both | imagesOps | fileIndex must be 0-4, isThumbnail boolean. |
| **Schema - _version Required for PATCH** | Must provide version number for optimistic locking | ElysiaValidationErr (422) | PATCH | _version | Integer for concurrency control. |
| **Business - Category Exists** | Category must exist in database | PrismaError (404) | Both | categoryId | `findUniqueOrThrow` fails if not found. |
| **Business - Name Uniqueness** | Product name must be unique across all products | CustomError (409) | Both | name | Database constraint check. |
| **Business - Optimistic Locking** | _version must match current DB version | CustomError (409) | PATCH | _version | Prevents concurrent modification conflicts. |
| **Images - Min 1 Image** | Product must have at least 1 image after all operations | VIO2 (400) | PATCH | imagesOps.delete | Cannot delete all images without creating new ones. |
| **Images - Max 5 Images** | Cannot exceed 5 images total | ElysiaValidationErr (422) | Both | images | File objects, not just metadata. |
| **Images - Single Thumbnail** | Only one image can be marked as thumbnail in final state | VIO1 (400) | Both | imagesOps.create, imagesOps.update | Auto-assigns thumbnail if none specified, fails if multiple. |
| **Variants - Valid Attribute Values** | All attributeValueIds must belong to product category | VVA1 (400) | Both | variants.create, variants.update | Cross-references category.attributes.values. |
| **Variants - Single Value per Attribute** | No variant can have multiple values from same attribute | VVA2 (400) | Both | variants.create, variants.update | Attribute value uniqueness per variant. |
| **Variants - Category Capacity** | Total variants cannot exceed category's possible combinations | VVA3 (400) | Both | variants | Max = product of attribute value counts (e.g., 3 attrs × 2 vals = 6 max). |
| **Variants - Unique Combinations** | No two variants can have identical attribute value combinations | VVA4 (400) | Both | variants | Sorted comparison of attributeValueIds arrays. |
| **Variants - Publish Price > 0** | All variants must have positive price when status='PUBLISHED' | PUB1 (400) | Both | variants.price | Only enforced for PUBLISHED products. |
| **Variants - Publish Attributes** | Variants must have attributes if category requires them | PUB2 (400) | Both | variants.attributeValueIds | Only enforced for PUBLISHED products with attributes. |
| **Variants - Min 1 Variant** | Product must have at least 1 variant after operations | Custom (400) | PATCH | variants.delete | Cannot delete all variants without creating new ones. |
| **Category Change - Atomic Operations** | Category changes require complete variant replacement | Custom (400) | PATCH | categoryId, variants | Must delete all existing variants and create new ones matching new category. |
| **Bulk Patch - Publish Validation** | For bulk status change to PUBLISHED, validate all products meet publish requirements | PUB1/PUB2 (400) | Bulk PATCH | status, categoryId | Validates price > 0 and attribute requirements for each product. |
| **Bulk Patch - Category Change Cleanup** | When changing category in bulk, clear all variant attribute values | Database Operation | Bulk PATCH | categoryId | Automatically removes attribute associations when category changes. |
| **Bulk Patch - Auto-Draft on Category Change** | When changing category with >1 variant and requesting PUBLISHED, auto-set to DRAFT | Business Logic | Bulk PATCH | categoryId, status | Prevents publishing products that need reconfiguration after category change. |