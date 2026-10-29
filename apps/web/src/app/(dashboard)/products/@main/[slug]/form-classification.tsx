"use client";

import type * as CategoryModel from "@spice-world/server/modules/categories/model";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@spice-world/web/components/ui/card";
import { FieldGroup } from "@spice-world/web/components/ui/field";
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spice-world/web/components/ui/select";
import { app } from "@spice-world/web/lib/elysia";
import { useState } from "react";
import { type ProductForm, useProductSidebarSync } from "../../store";
import { CategoryDialog } from "./category-dialog";

interface ProductFormClassificationProps {
  form: ProductForm;
  initialCategories: CategoryModel.getResult;
  isNew: boolean;
  slug: string;
}

export const ProductFormClassification = ({
  form,
  isNew,
  slug,
  initialCategories,
}: ProductFormClassificationProps) => {
  const updateSidebar = useProductSidebarSync(isNew, slug);

  const [categories, setCategories] =
    useState<CategoryModel.getResult>(initialCategories);

  const fetchCategories = async () => {
    const { data } = await app.categories.get();
    if (data) {
      setCategories(data);
    }
  };

  const handleCategoryChange = (newCategoryId: string) => {
    const currentCategoryId = form.getFieldValue("categoryId");

    if (currentCategoryId && currentCategoryId !== newCategoryId) {
      // Get existing variant IDs
      const variantsUpdate = form.getFieldValue("variants.update");
      const existingIds = variantsUpdate?.map((v) => v.id) || [];

      form.setFieldValue("variants", {
        delete: existingIds,
        update: [],
        create: [
          {
            price: 0,
            sku: undefined,
            stock: 0,
            currency: "EUR",
            attributeValueIds: [],
          },
        ],
      });
    }

    form.setFieldValue("categoryId", newCategoryId);
  };

  return (
    <Card className="rounded-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Classification</CardTitle>
          <CategoryDialog
            categories={categories}
            onCategoryChange={fetchCategories}
          />
        </div>
        <CardDescription>
          Manage the product's category and visibility status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <form.AppField
            name="categoryId"
            validators={{
              onChange: ({ value }) => {
                updateSidebar("categoryId", value ?? "");
              },
            }}
          >
            {(field) => (
              <field.Field>
                <field.Label htmlFor={field.name}>Category</field.Label>
                <field.Select
                  items={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  onValueChange={(id) =>
                    id !== null && handleCategoryChange(id)
                  }
                >
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <span className="first-letter:capitalize">
                            {category.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </field.Select>
                <field.Message />
              </field.Field>
            )}
          </form.AppField>
          <form.AppField
            name="status"
            validators={{
              onChange: ({ value }) => {
                updateSidebar("status", value ?? "DRAFT");
              },
            }}
          >
            {(field) => (
              <field.Field>
                <field.Label htmlFor={field.name}>Status</field.Label>
                <field.Select
                  items={[
                    { value: "DRAFT", label: "Draft" },
                    { value: "PUBLISHED", label: "Published" },
                    { value: "ARCHIVED", label: "Archived" },
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PUBLISHED">Published</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </field.Select>
                <field.Message />
              </field.Field>
            )}
          </form.AppField>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
