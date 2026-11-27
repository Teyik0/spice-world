import * as ProductModel from "@spice-world/server/modules/products/model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@spice-world/ui/components/alert-dialog";
import { Button } from "@spice-world/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@spice-world/ui/components/card";
import { FieldGroup } from "@spice-world/ui/components/field";
import {
  focusFirstError,
  SubmitButton,
  useAppForm,
} from "@spice-world/ui/components/form";
import { standardSchema } from "@spice-world/ui/lib/schema";
import { useNavigate } from "@teyik0/furin/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { api } from "../../../../lib/api";
import { ON_DARK } from "./bulk-actions";
import { label, STATUSES } from "./products-query";

const STATUS_ITEMS = STATUSES.map((value) => ({ label: label(value), value }));

function categoryHint(product: ProductModel.productResult, categoryId: string) {
  if (categoryId === product.categoryId) {
    return "Sets the attributes its variants can use.";
  }
  if (product.variants.length > 1) {
    return "A product with several variants cannot change category: its variants would become identical.";
  }
  return product.variants[0]?.attributeValues.length
    ? "Saving clears the attribute values of its variant."
    : "Sets the attributes its variants can use.";
}

const fieldsOf = (product: ProductModel.productResult) => ({
  name: product.name,
  description: product.description,
  status: product.status,
  categoryId: product.categoryId,
});

export function ProductEditor({
  categories,
  product,
}: {
  categories: { id: string; name: string }[];
  product: ProductModel.productResult;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(product);

  const form = useAppForm({
    defaultValues: fieldsOf(saved),
    validators: { onSubmit: standardSchema(ProductModel.patchBody) },
    onSubmitInvalid: focusFirstError,
    onSubmit: async ({ value, formApi }) => {
      const initial = fieldsOf(saved);
      const changed = Object.fromEntries(
        Object.entries(value).filter(
          ([key, field]) => field !== initial[key as keyof typeof initial],
        ),
      );
      const variants =
        value.categoryId === saved.categoryId
          ? undefined
          : {
              update: saved.variants
                .filter(({ attributeValues }) => attributeValues.length)
                .map(({ id }) => ({ id, attributeValueIds: [] })),
            };
      const { data, error } = await api
        .products({ id: saved.id })
        .patch(
          { ...changed, variants },
          { headers: { "x-version": saved.version } },
        );
      if (error) {
        toast.error(error.value.message);
        return;
      }
      setSaved(data);
      formApi.reset(fieldsOf(data));
      toast.success("Product saved.");
      if (data.slug !== saved.slug) {
        await navigate({
          to: "/products/:slug",
          params: { slug: data.slug },
          replace: true,
        });
      }
    },
  });

  return (
    <form
      action={() => form.handleSubmit()}
      className="mx-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      noValidate
    >
      <div className="flex items-center gap-3 lg:col-span-2">
        <h1 className="truncate text-2xl font-semibold tracking-tight first-letter:uppercase">
          {saved.name}
        </h1>
        <DeleteProduct
          className="ml-auto"
          onDeleted={() => navigate({ to: "/products", replace: true })}
          product={saved}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>What customers read in the store.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  description="Lowercase. The product URL follows the name."
                  label="Name"
                  onChange={(e) =>
                    field.handleChange(e.target.value.toLowerCase())
                  }
                  spellCheck={false}
                />
              )}
            </form.AppField>
            <form.AppField name="description">
              {(field) => (
                <field.TextareaField className="min-h-40" label="Description" />
              )}
            </form.AppField>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Visibility and catalog placement.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form.AppField name="status">
              {(field) => (
                <field.SelectField
                  description={
                    field.state.value === "PUBLISHED"
                      ? "Visible in the store."
                      : "Hidden from the store."
                  }
                  items={STATUS_ITEMS}
                  label="Status"
                />
              )}
            </form.AppField>
            <form.AppField name="categoryId">
              {(field) => (
                <field.SelectField
                  description={categoryHint(saved, field.state.value)}
                  items={categories.map(({ id, name }) => ({
                    label: name,
                    value: id,
                  }))}
                  label="Category"
                />
              )}
            </form.AppField>
          </FieldGroup>
        </CardContent>
      </Card>

      <form.Subscribe selector={(state) => state.isDefaultValue}>
        {(isDefault) =>
          isDefault ? null : (
            <div
              aria-label="Unsaved changes"
              className="bg-foreground text-background fixed inset-x-0 bottom-6 z-20 mx-auto flex w-fit items-center gap-1 rounded-xl p-1.5 pl-4 shadow-lg"
              role="region"
            >
              <span className="mr-2 text-sm font-medium whitespace-nowrap">
                Unsaved changes
              </span>
              <Button
                className={ON_DARK}
                onClick={() => form.reset()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Discard
              </Button>
              <SubmitButton
                className="bg-background text-foreground hover:bg-background/90"
                size="sm"
              >
                Save
              </SubmitButton>
            </div>
          )
        }
      </form.Subscribe>
    </form>
  );
}

function DeleteProduct({
  className,
  onDeleted,
  product,
}: {
  className?: string;
  onDeleted: () => void;
  product: ProductModel.productResult;
}) {
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      const { error } = await api.products({ id: product.id }).delete();
      if (error) {
        const { value } = error;
        toast.error(
          "message" in value ? value.message : (value.detail ?? value.title),
        );
        return;
      }
      toast.success("Product deleted.");
      onDeleted();
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            className={className}
            size="sm"
            type="button"
            variant="destructive"
          />
        }
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its variants and images are deleted with it. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={remove}
            variant="destructive"
          >
            Delete Product
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
