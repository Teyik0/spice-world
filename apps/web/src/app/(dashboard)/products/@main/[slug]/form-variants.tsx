"use client";

import type * as AttributeModel from "@spice-world/server/modules/attributes/model";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import {
  type AttributeGroup,
  AttributeSelect,
} from "@spice-world/web/components/ui/attribute-select";
import { Button } from "@spice-world/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@spice-world/web/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@spice-world/web/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spice-world/web/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@spice-world/web/components/ui/table";
import { app, elysiaErrorToString } from "@spice-world/web/lib/elysia";
import { useStore } from "@tanstack/react-form";
import type { UnwrapSchema } from "elysia";
import { PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProductForm } from "../../store";

function getAttributePlaceholder(
  loading: boolean,
  hasCategory: boolean,
  count: number,
) {
  if (loading) {
    return "Loading...";
  }
  if (!hasCategory) {
    return "Select category first";
  }
  return count === 0 ? "No attributes available" : "Select attributes";
}

const DEFAULT_VARIANT: UnwrapSchema<typeof ProductModel.variantCreate> = {
  price: 0,
  sku: undefined,
  stock: 0,
  currency: "EUR",
  attributeValueIds: [],
};

interface ProductFormVariantsProps {
  form: ProductForm;
}

// Inline modal component for selecting attribute when creating new value
const AttributeSelectorDialog = ({
  open,
  onOpenChange,
  attributes,
  onSelect,
  valueName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributes: AttributeModel.attributeResult[];
  onSelect: (attributeId: string) => void;
  valueName: string;
}) => {
  const [selectedId, setSelectedId] = useState<string>("");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Attribute</DialogTitle>
          <DialogDescription>
            Choose which attribute "{valueName}" should belong to
          </DialogDescription>
        </DialogHeader>
        <Select
          items={attributes.map((attr) => ({
            value: attr.id,
            label: attr.name,
          }))}
          onValueChange={(value) => setSelectedId(value ?? "")}
          value={selectedId || null}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select attribute" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {attributes.map((attr) => (
                <SelectItem key={attr.id} value={attr.id}>
                  {attr.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!selectedId}
            onClick={() => {
              onSelect(selectedId);
              onOpenChange(false);
              setSelectedId("");
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ProductFormVariants = ({ form }: ProductFormVariantsProps) => {
  const [attributes, setAttributes] = useState<
    AttributeModel.attributeResult[]
  >([]);
  const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);
  const [isAttributeSelectorOpen, setIsAttributeSelectorOpen] = useState(false);
  const [pendingValueName, setPendingValueName] = useState<string>("");
  const [currentVariantIndex, setCurrentVariantIndex] = useState<number>(0);

  const categoryId = useStore(form.store, (state) => state.values.categoryId);
  const variants = useStore(form.store, (state) => state.values.variants);

  // Type guard to check if variants has update/delete (patchBody)
  const isPatchVariants = (
    v: typeof variants,
  ): v is {
    create?: Array<{
      price: number;
      sku?: string;
      stock?: number;
      currency?: string;
      attributeValueIds: string[];
    }>;
    update?: Array<{
      id: string;
      price?: number;
      sku?: string;
      stock?: number;
      currency?: string;
      attributeValueIds?: string[];
    }>;
    delete?: string[];
  } => v !== undefined && typeof v === "object" && !("0" in v);

  // Extract variants from the operations structure
  // For display purposes, we merge create + update arrays
  // biome-ignore lint/correctness/useExhaustiveDependencies: ok
  const variantsArray = useMemo(() => {
    if (!variants) {
      return [];
    }

    if (isPatchVariants(variants)) {
      const createVariants = variants.create || [];
      const updateVariants = variants.update || [];
      return [...updateVariants, ...createVariants];
    }

    // It's postBody - variants.create is the array
    return variants.create || [];
  }, [variants]);

  useEffect(() => {
    const fetchAttributes = async () => {
      if (!categoryId) {
        setAttributes([]);
        return;
      }
      setIsLoadingAttributes(true);
      const { data, error } = await app.attributes.get({
        query: { categoryId },
      });

      if (error) {
        toast.error(
          `Failed to fetch attributes: ${elysiaErrorToString(error)}`,
        );
      }

      if (data) {
        setAttributes(data);
      }
      setIsLoadingAttributes(false);
    };
    fetchAttributes();
  }, [categoryId]);

  const attributeGroups = useMemo(
    (): AttributeGroup[] =>
      attributes.map((attr) => ({
        attributeId: attr.id,
        attributeName: attr.name,
        values: attr.values.map((val) => ({
          id: val.id,
          value: val.value,
        })),
      })),
    [attributes],
  );

  // Handler to initiate creation of new attribute value
  const handleCreateNew = (variantIndex: number) => {
    return (
      valueName: string,
    ): Promise<{ id: string; value: string } | null> => {
      setPendingValueName(valueName);
      setCurrentVariantIndex(variantIndex);
      setIsAttributeSelectorOpen(true);
      return Promise.resolve(null); // Modal will handle the actual creation
    };
  };

  const selectCreatedValue = (valueId: string) => {
    const variant = variantsArray[currentVariantIndex];
    if (!(variant && variants)) {
      return;
    }
    const currentValues = variant.attributeValueIds || [];
    const newValues = [...currentValues, valueId];

    if (isPatchVariants(variants)) {
      // Determine if this is a create or update variant
      const variantId = "id" in variant ? variant.id : undefined;
      const updateIndex = variants.update?.findIndex((v) => v.id === variantId);
      const createIndex = variants.create?.findIndex(
        (_, i) => i === currentVariantIndex - (variants.update?.length || 0),
      );

      if (updateIndex !== undefined && updateIndex >= 0) {
        form.setFieldValue(
          `variants.update[${updateIndex as number}].attributeValueIds`,
          newValues,
        );
      } else if (createIndex !== undefined && createIndex >= 0) {
        form.setFieldValue(
          `variants.create[${createIndex as number}].attributeValueIds`,
          newValues,
        );
      }
    } else {
      form.setFieldValue(
        `variants.create[${currentVariantIndex}].attributeValueIds`,
        newValues,
      );
    }
  };

  // Handler when user selects an attribute in the modal
  const handleAttributeSelected = async (attributeId: string) => {
    try {
      // Create new attribute value via API
      const { data, error } = await app
        .attributes({ id: attributeId })
        .values.post({
          name: pendingValueName,
        });

      if (error) {
        toast.error(`Failed to create value: ${elysiaErrorToString(error)}`);
        return;
      }

      if (data) {
        // Refresh attributes to include new value
        const { data: updatedAttrs } = await app.attributes.get({
          query: { categoryId },
        });
        if (updatedAttrs) {
          setAttributes(updatedAttrs);
        }

        // Auto-select the newly created value
        selectCreatedValue(data.id);

        toast.success("Attribute value created successfully");
      }
    } catch {
      toast.error("Failed to create attribute value");
    }
  };

  const handleAddVariant = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!variants) {
      return;
    }

    if (isPatchVariants(variants)) {
      const currentCreate = variants.create || [];
      form.setFieldValue("variants.create", [
        ...currentCreate,
        DEFAULT_VARIANT,
      ]);
    } else {
      // For postBody, we need to update the entire variants object
      const currentCreate = variants.create || [];
      form.setFieldValue("variants", {
        create: [...currentCreate, DEFAULT_VARIANT],
      });
    }
  };

  const handleRemoveVariant = (index: number) => {
    if (variantsArray.length <= 1 || !variants) {
      return;
    }

    const variant = variantsArray[index];
    if (!variant) {
      return;
    }

    if (isPatchVariants(variants)) {
      // Check if it's an update variant (has id) or create variant (no id)
      const variantId = "id" in variant ? variant.id : undefined;
      if (variantId) {
        // It's an existing variant - add to delete list
        const currentDeletes = variants.delete || [];
        form.setFieldValue("variants.delete", [...currentDeletes, variantId]);

        // Also remove from update list
        const updatedUpdate = (variants.update || []).filter(
          (v) => v.id !== variantId,
        );
        form.setFieldValue("variants.update", updatedUpdate);
      } else {
        // It's a new variant - just remove from create list
        const createIndex = index - (variants.update?.length || 0);
        const updatedCreate = (variants.create || []).filter(
          (_, i) => i !== createIndex,
        );
        form.setFieldValue("variants.create", updatedCreate);
      }
    } else {
      // postBody - update the entire variants object
      const updatedCreate = (variants.create || []).filter(
        (_, i) => i !== index,
      );
      form.setFieldValue("variants", {
        create: updatedCreate,
      });
    }
  };

  return (
    <Card className="rounded-md">
      <CardHeader>
        <CardTitle>Stock & Variants</CardTitle>
        <CardDescription>
          Add product variants with attributes and manage stock
        </CardDescription>
      </CardHeader>
      <CardContent className="w-0 min-w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attributes</TableHead>
              <TableHead className="w-20">SKU</TableHead>
              <TableHead className="w-20">Price (€)</TableHead>
              <TableHead className="w-20">Stock</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {variantsArray.map((variant, index) => {
              const variantId = "id" in variant ? variant.id : undefined;
              let fieldPrefix:
                `variants.create[${number}]` | `variants.update[${number}]`;

              if (isPatchVariants(variants)) {
                const isUpdate = variantId !== undefined;
                const updateIndex = isUpdate
                  ? variants.update?.findIndex((v) => v.id === variantId)
                  : -1;
                const createIndex = isUpdate
                  ? -1
                  : index - (variants.update?.length || 0);

                if (isUpdate) {
                  fieldPrefix = `variants.update[${updateIndex as number}]`;
                } else {
                  fieldPrefix = `variants.create[${createIndex}]`;
                }
              } else {
                // postBody - all variants are in create array
                fieldPrefix = `variants.create[${index}]`;
              }

              return (
                <TableRow key={variantId ?? `new-${index}`}>
                  <TableCell className="min-w-40">
                    <form.AppField name={`${fieldPrefix}.attributeValueIds`}>
                      {(field) => (
                        <div className="flex flex-col gap-1">
                          <AttributeSelect
                            className="min-w-full"
                            creatable={true}
                            disabled={
                              isLoadingAttributes ||
                              !categoryId ||
                              attributes.length === 0
                            }
                            groups={attributeGroups}
                            maxCount={2}
                            onBlur={field.handleBlur}
                            onCreateNew={handleCreateNew(index)}
                            onValueChange={(newValues) => {
                              field.handleChange(newValues);
                            }}
                            placeholder={getAttributePlaceholder(
                              isLoadingAttributes,
                              Boolean(categoryId),
                              attributes.length,
                            )}
                            value={field.state.value}
                          />
                          <field.Message variant="tooltip" />
                        </div>
                      )}
                    </form.AppField>
                  </TableCell>

                  <TableCell>
                    <form.AppField name={`${fieldPrefix}.sku`}>
                      {(field) => (
                        <div className="relative flex flex-col gap-1">
                          <field.Input
                            className="w-20"
                            placeholder="SKU-001"
                            type="text"
                          />
                          <div className="absolute -top-1.5 -right-1.5 z-10">
                            <field.Message variant="tooltip" />
                          </div>
                        </div>
                      )}
                    </form.AppField>
                  </TableCell>

                  <TableCell>
                    <form.AppField name={`${fieldPrefix}.price`}>
                      {(field) => (
                        <div className="relative flex flex-col gap-1">
                          <field.Input
                            className="w-20"
                            min="0"
                            onChange={(e) =>
                              field.handleChange(Number(e.target.value))
                            }
                            placeholder="0.00"
                            step="0.01"
                            type="number"
                          />
                          <div className="absolute -top-1.5 -right-1.5 z-10">
                            <field.Message variant="tooltip" />
                          </div>
                        </div>
                      )}
                    </form.AppField>
                  </TableCell>

                  <TableCell>
                    <form.AppField name={`${fieldPrefix}.stock`}>
                      {(field) => (
                        <div className="relative flex flex-col gap-1">
                          <field.Input
                            className="w-20"
                            min="0"
                            onChange={(e) =>
                              field.handleChange(Number(e.target.value))
                            }
                            placeholder="0"
                            type="number"
                          />
                          <div className="absolute -top-1.5 -right-1.5 z-10">
                            <field.Message variant="tooltip" />
                          </div>
                        </div>
                      )}
                    </form.AppField>
                  </TableCell>

                  <TableCell>
                    <Button
                      className="h-8 w-8"
                      disabled={variantsArray.length <= 1}
                      onClick={() => handleRemoveVariant(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove variant</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-center border-t p-4">
        <Button
          className="gap-1"
          onClick={handleAddVariant}
          size="sm"
          type="button"
          variant="ghost"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Variant
        </Button>
      </CardFooter>

      <AttributeSelectorDialog
        attributes={attributes}
        onOpenChange={setIsAttributeSelectorOpen}
        onSelect={handleAttributeSelected}
        open={isAttributeSelectorOpen}
        valueName={pendingValueName}
      />
    </Card>
  );
};
