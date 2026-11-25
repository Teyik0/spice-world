"use client";

import type * as CategoryModel from "@spice-world/server/modules/categories/model";
import type { productResult } from "@spice-world/server/modules/products/model";
import {
  patchBody,
  postBody,
} from "@spice-world/server/modules/products/model";
import { Form, useForm } from "@spice-world/web/components/tanstack-form";
import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@spice-world/web/components/ui/dialog";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { unknownError } from "@spice-world/web/lib/utils";
import { useSetAtom } from "jotai";
import { ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProductItemProps } from "../../store";
import { newProductAtom, productPagesAtom } from "../../store";
import { revalidateProductPath } from "./action";
import { ProductFormClassification } from "./form-classification";
import { ProductFormDetails } from "./form-details";
import { ProductFormImages } from "./form-images";
import { ProductFormVariants } from "./form-variants";

interface AttributeValueInfo {
  attributeId: string;
  values: string[];
}

export const ProductForm = ({
  product,
  categories,
}: {
  product: productResult;
  categories: CategoryModel.categoryResult[];
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isNew = pathname.endsWith("new");
  const queryString = searchParams.toString();

  const setNewProduct = useSetAtom(newProductAtom);
  const setPages = useSetAtom(productPagesAtom);

  const versionRef = useRef(product.version);
  const [formResetKey, setFormResetKey] = useState(0);
  const [showCategoryWarning, setShowCategoryWarning] = useState(false);
  const [attributesToRemove, setAttributesToRemove] = useState<
    AttributeValueInfo[]
  >([]);

  const handleDiscard = () => {
    form.reset();
    versionRef.current = product.version;
    setFormResetKey((k) => k + 1);
  };

  const getAttributesToRemove = (): AttributeValueInfo[] => {
    const attributeMap = new Map<string, Set<string>>();

    for (const variant of product.variants) {
      for (const attrValue of variant.attributeValues) {
        const attrId = attrValue.attributeId;
        if (!attributeMap.has(attrId)) {
          attributeMap.set(attrId, new Set());
        }
        attributeMap.get(attrId)?.add(attrValue.value);
      }
    }

    return Array.from(attributeMap.entries()).map(([attributeId, values]) => ({
      attributeId,
      values: Array.from(values),
    }));
  };

  const hasCategoryChanged = () => {
    const currentCategoryId = form.getFieldValue("categoryId");
    return currentCategoryId !== product.categoryId;
  };

  const hasExistingAttributeValues = () =>
    product.variants.some(
      (v) => v.attributeValues && v.attributeValues.length > 0,
    );

  const executeSubmit = async () => {
    const { values } = form.store.state;
    try {
      let data: productResult;
      if (isNew) {
        const result = await handleCreate(values as postBody);
        data = result;
      } else {
        data = await handleUpdate(values as patchBody);
        versionRef.current = data.version;
        form.setFieldValue("variants", {
          create: undefined,
          update: data.variants.map((v) => ({
            id: v.id,
            price: v.price / 100, // Convert cents to decimal for display
            sku: v.sku ?? undefined,
            stock: v.stock,
            currency: v.currency,
            attributeValueIds: v.attributeValues.map((av) => av.id),
          })),
          delete: undefined,
        });
        form.setFieldValue("images", {
          create: undefined,
          update: undefined,
          delete: undefined,
        });
      }
      await revalidateProductPath(data.slug); // make discard work after any update

      // Update sidebar list
      const buildSidebarProduct = (
        existingImg?: string | null,
      ): ProductItemProps => ({
        id: data.id,
        name: data.name,
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        slug: data.slug,
        description: data.description,
        categoryId: data.categoryId,
        version: data.version,
        img:
          data.images.find((img) => img.isThumbnail)?.urlThumb ??
          existingImg ??
          null,
        priceMin: data.variants.reduce(
          (min, v) => Math.min(v.price, min),
          data.variants[0]?.price ?? 0,
        ), // Stored in cents, converted to decimal by formatPrice
        priceMax: data.variants.reduce(
          (max, v) => Math.max(v.price, max),
          data.variants[0]?.price ?? 0,
        ), // Stored in cents, converted to decimal by formatPrice
        totalStock: data.variants.reduce((sum, v) => sum + v.stock, 0),
      });

      setPages((pages) => {
        if (isNew) {
          // Add new product to the beginning of first page
          const newPages = [...pages];
          if (newPages[0]) {
            newPages[0] = [buildSidebarProduct(), ...newPages[0]];
          } else {
            newPages[0] = [buildSidebarProduct()];
          }
          return newPages;
        }

        // Update existing product
        const pageIndex = pages.findIndex((page) =>
          page.some((p) => p.id === data.id),
        );
        if (pageIndex === -1) {
          return pages;
        }

        const newPages = [...pages];
        const currentPage = newPages[pageIndex];
        if (!currentPage) {
          return pages;
        }

        newPages[pageIndex] = currentPage.map((p) =>
          p.id === data.id ? buildSidebarProduct(p.img) : p,
        );
        return newPages;
      });

      if (data.slug !== product.slug) {
        router.push(
          `/products/${data.slug}${queryString ? `?${queryString}` : ""}`,
        );
      }
    } catch (error: unknown) {
      const err = unknownError(
        error,
        isNew ? "Failed to create product" : "Failed to update product",
      );
      toast.error(elysiaErrorToString(err));
    }
  };

  const form = useForm<typeof postBody | typeof patchBody>({
    schema: isNew ? postBody : patchBody,
    defaultValues: {
      name: product.name,
      description: product.description,
      status: product.status,
      categoryId: product.categoryId,
      // Keep keys the schema rejects out: postBody only accepts `create`
      variants: isNew
        ? {
            create: [
              {
                price: 0, // Display as €0.00 in decimal format
                sku: undefined,
                stock: 0,
                currency: "EUR",
                attributeValueIds: [],
              },
            ],
          }
        : {
            create: undefined,
            update: product.variants.map((v) => ({
              id: v.id,
              price: v.price / 100, // Convert cents to decimal for display (1999 → 19.99)
              sku: v.sku ?? undefined,
              stock: v.stock,
              currency: v.currency,
              attributeValueIds: v.attributeValues.map((av) => av.id),
            })),
            delete: undefined,
          },
      images: isNew
        ? { create: undefined }
        : { create: undefined, update: undefined, delete: undefined },
    },
    onSubmit: async () => {
      if (!isNew && hasCategoryChanged() && hasExistingAttributeValues()) {
        setAttributesToRemove(getAttributesToRemove());
        setShowCategoryWarning(true);
        return;
      }
      await executeSubmit();
    },
    onSubmitInvalid({ formApi }) {
      console.error(formApi);
      toast.error("Invalid submit");
    },
  });

  const handleConfirmCategoryChange = async () => {
    setShowCategoryWarning(false);
    await executeSubmit();
  };

  const handleCreate = async (values: postBody) => {
    // Convert prices from decimal (user input) to cents (backend storage)
    const convertedValues = {
      ...values,
      variants: {
        ...values.variants,
        create: values.variants.create?.map((variant) => ({
          ...variant,
          price: Math.round(variant.price * 100), // Convert €19.99 → 1999 cents
        })),
      },
    };

    const { data, error } = await app.products.post(convertedValues);
    if (error) {
      throw new Error(
        `Failed to create product with error ${error.status}: ${elysiaErrorToString(error)}`,
        { cause: error },
      );
    }

    toast.success("Product created successfully");
    setNewProduct(null);
    return data;
  };

  const handleUpdate = async (values: patchBody) => {
    // Convert prices from decimal (user input) to cents (backend storage)
    const { variants } = values;
    const convertedValues = {
      ...values,
      variants: variants
        ? {
            ...variants,
            create: variants.create?.map((variant) => ({
              ...variant,
              price: Math.round((variant.price ?? 0) * 100), // Convert €19.99 → 1999 cents
            })),
            update: variants.update?.map((variant) => ({
              ...variant,
              price: Math.round((variant.price ?? 0) * 100), // Convert €19.99 → 1999 cents
            })),
          }
        : undefined,
    };

    const { data, error } = await app
      .products({ id: product.id })
      .patch(convertedValues, {
        headers: { "x-version": versionRef.current },
      });
    if (error) {
      throw new Error(
        `Failed to update product with error ${error.status}: ${elysiaErrorToString(error)}`,
        { cause: error },
      );
    }

    toast.success("Product updated successfully");
    return data;
  };

  const [isDeleting, startTransition] = useTransition();
  const handleDelete = () => {
    startTransition(async () => {
      try {
        const { error } = await app.products({ id: product.id }).delete();
        if (error) {
          toast.error(
            `Failed to delete product: ${elysiaErrorToString(error)}`,
          );
          return;
        }
        // Remove product from sidebar list
        setPages((pages) =>
          pages.map((page) => page.filter((p) => p.id !== product.id)),
        );
        toast.success("Product deleted successfully");
        router.push(`/products${queryString ? `?${queryString}` : ""}`);
      } catch (error: unknown) {
        const err = unknownError(error, "Failed to delete product");
        toast.error(elysiaErrorToString(err));
      }
    });
  };

  const hasStock = product.variants.some((variant) => variant.stock > 0);
  return (
    <section className="@container w-full p-6">
      <Form className="mx-auto flex max-w-260 flex-col" form={form}>
        <div className="grid w-full gap-6 @sm:grid-cols-[1fr_320px] @lg:grid-cols-[600px_320px] @xl:@lg:grid-cols-5">
          <div className="flex items-center gap-3 @md:col-span-1 @lg:col-span-2 @xl:col-span-3">
            <Button
              className="h-7 w-7"
              nativeButton={false}
              render={
                <Link href={`/products${queryString ? `?${queryString}` : ""}`}>
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Back</span>
                </Link>
              }
              size="icon"
              variant="outline"
            />

            <h1 className="flex-1 shrink-0 text-xl font-semibold tracking-tight whitespace-nowrap capitalize sm:grow-0">
              {form.store.state.values.name}
            </h1>
            {hasStock ? (
              <Badge className="ml-auto text-xs sm:ml-0" variant="outline">
                In stock
              </Badge>
            ) : (
              <Badge className="ml-auto text-xs sm:ml-0" variant="destructive">
                Out of stock
              </Badge>
            )}
          </div>

          {/* Boutons d'action (desktop) */}
          <div className="flex justify-end gap-3 @xl:col-span-2">
            {!isNew && (
              <Dialog>
                <DialogTrigger
                  render={
                    <Button size="sm" type="button" variant="destructive">
                      Delete
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete product?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={
                        <Button disabled={isDeleting} variant="outline">
                          Cancel
                        </Button>
                      }
                    />
                    <Button
                      disabled={isDeleting}
                      onClick={() => handleDelete()}
                      variant="destructive"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />{" "}
                          Deleting...
                        </>
                      ) : (
                        "Delete"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button
              onClick={handleDiscard}
              size="sm"
              type="button"
              variant="outline"
            >
              Discard
            </Button>
            <form.SubmitButton size="sm">Save Product</form.SubmitButton>
          </div>

          <div className="grid gap-6 @xl:col-span-3">
            <ProductFormDetails form={form} isNew={isNew} slug={product.slug} />
            <ProductFormVariants form={form} />
          </div>
          <div className="grid gap-6 @xl:col-span-2">
            <ProductFormClassification
              form={form}
              initialCategories={categories}
              isNew={isNew}
              slug={product.slug}
            />
            <ProductFormImages
              existingImages={product.images}
              form={form}
              isNew={isNew}
              key={formResetKey}
              slug={product.slug}
            />
          </div>
        </div>

        {/* Boutons d'action (mobile) */}
        <div className="flex items-center justify-center gap-2 md:hidden">
          {!isNew && (
            <Button
              onClick={handleDelete}
              size="sm"
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          )}
          <Button
            onClick={handleDiscard}
            size="sm"
            type="button"
            variant="outline"
          >
            Discard
          </Button>
          <form.SubmitButton size="sm">Save Product</form.SubmitButton>
        </div>
      </Form>

      <Dialog onOpenChange={setShowCategoryWarning} open={showCategoryWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change category?</DialogTitle>
            <DialogDescription>
              Changing the category will delete all existing variants and their
              attribute values. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {attributesToRemove.length > 0 && (
            <div className="max-h-60 space-y-3 overflow-y-auto">
              <p className="text-sm font-medium">
                The following attributes will be removed:
              </p>
              {attributesToRemove.map((attr) => (
                <div className="flex flex-wrap gap-1" key={attr.attributeId}>
                  {attr.values.map((value) => (
                    <Badge key={value} variant="secondary">
                      {value}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setShowCategoryWarning(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmCategoryChange} variant="destructive">
              Change category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
