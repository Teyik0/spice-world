import * as CategoryModel from "@spice-world/server/modules/categories/model";
import {
  MAX_ATTRIBUTES,
  nameLowerPatternWithNumber,
} from "@spice-world/server/modules/shared";
import { Badge } from "@spice-world/ui/components/badge";
import { Button } from "@spice-world/ui/components/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@spice-world/ui/components/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@spice-world/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@spice-world/ui/components/field";
import {
  focusFirstError,
  SubmitButton,
  submitOnce,
  useAppForm,
} from "@spice-world/ui/components/form";
import { Input } from "@spice-world/ui/components/input";
import { standardSchema } from "@spice-world/ui/lib/schema";
import type { UnwrapSchema } from "elysia";
import { t } from "elysia";
import { ImageIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDelete } from "../../../../components/confirm-delete";
import { api } from "../../../../lib/api";
import { useObjectUrl } from "./product-images";
import { label as capitalized } from "./products-query";

type Category = CategoryModel.categoryResult;

const draftBody = (file: typeof CategoryModel.postBody.properties.file) =>
  t.Object({
    name: CategoryModel.postBody.properties.name,
    file,
    attributes: t.Refine(
      t.Array(t.Object(CategoryModel.postAttribute.properties), {
        maxItems: MAX_ATTRIBUTES,
      }),
      CategoryModel.uniqueAttributeNames,
      CategoryModel.uniqueAttributeNamesMessage,
    ),
  });

type Draft = UnwrapSchema<typeof CategoryModel.postAttribute> & {
  id?: string;
  key: string;
};
const valueSchema = standardSchema(nameLowerPatternWithNumber)["~standard"];

const emptyAttribute = (): Draft => ({
  key: crypto.randomUUID(),
  name: "",
  values: [],
});
const ROW =
  "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem] items-start gap-2";

const toastProblem = (problem: { detail?: string; title: string }) =>
  toast.error(problem.detail ?? problem.title);

function attributeOperations(
  saved: Category["attributes"],
  drafts: Draft[],
): CategoryModel.attributeOperations | undefined {
  const create = drafts.flatMap(({ id, name, values }) =>
    id ? [] : [{ name, values }],
  );
  const update = drafts.flatMap(({ id, name, values }) => {
    const attribute = saved.find((a) => a.id === id);
    if (!attribute) {
      return [];
    }
    const added = values.filter(
      (value) => !attribute.values.some((v) => v.value === value),
    );
    const removed = attribute.values.filter((v) => !values.includes(v.value));
    const ops = {
      ...(added.length && { create: added }),
      ...(removed.length && { delete: removed.map((v) => v.id) }),
    };
    const renamed = name !== attribute.name;
    return renamed || Object.keys(ops).length
      ? [
          {
            id: attribute.id,
            ...(renamed && { name }),
            ...(Object.keys(ops).length && { values: ops }),
          },
        ]
      : [];
  });
  const kept = new Set(drafts.map(({ id }) => id));
  const remove = saved.filter(({ id }) => !kept.has(id)).map(({ id }) => id);
  const ops = {
    ...(create.length && { create }),
    ...(update.length && { update }),
    ...(remove.length && { delete: remove }),
  };
  return Object.keys(ops).length ? ops : undefined;
}

export function CategoryActions({
  category,
  onCategories,
  onSelect,
  onValues,
  savedId,
}: {
  category?: Category;
  onCategories: Dispatch<SetStateAction<Category[]>>;
  onSelect: (id: string) => void;
  onValues: (ids: Set<string>) => void;
  savedId: string;
}) {
  return (
    <div className="ml-auto flex gap-1">
      {category ? (
        <CategoryDialog
          category={category}
          onDeleted={
            category.id === savedId
              ? undefined
              : (id) => {
                  onCategories((list) => list.filter((c) => c.id !== id));
                  onSelect(savedId);
                }
          }
          onSaved={(saved) => {
            onCategories((list) =>
              list.map((c) => (c.id === saved.id ? saved : c)),
            );
            onValues(
              new Set(
                saved.attributes.flatMap(({ values }) =>
                  values.map(({ id }) => id),
                ),
              ),
            );
          }}
          trigger={
            <Button size="xs" type="button" variant="ghost">
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          }
        />
      ) : null}
      <CategoryDialog
        onSaved={(created) => {
          onCategories((list) => [...list, created]);
          onSelect(created.id);
        }}
        trigger={
          <Button size="xs" type="button" variant="ghost">
            <PlusIcon data-icon="inline-start" />
            New
          </Button>
        }
      />
    </div>
  );
}

export function CategoryAttributes({ category }: { category: Category }) {
  return (
    <ul aria-label="Attributes" className="flex flex-wrap gap-1.5">
      {category.attributes.map(({ id, name, values }) => (
        <li key={id}>
          <Badge
            title={values.map(({ value }) => value).join(", ")}
            variant="secondary"
          >
            {capitalized(name)}
            <span className="text-muted-foreground tabular-nums">
              {values.length}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function CategoryDialog({
  category,
  onDeleted,
  onSaved,
  trigger,
}: {
  category?: Category;
  onDeleted?: (id: string) => void;
  onSaved: (category: Category) => void;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <CategoryForm
          category={category}
          onDeleted={
            onDeleted &&
            ((id) => {
              setOpen(false);
              onDeleted(id);
            })
          }
          onSaved={(saved) => {
            setOpen(false);
            onSaved(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  onDeleted,
  onSaved,
}: {
  category?: Category;
  onDeleted?: (id: string) => void;
  onSaved: (category: Category) => void;
}) {
  const form = useAppForm({
    defaultValues: {
      name: category?.name ?? "",
      file: undefined as File | undefined,
      attributes: category
        ? category.attributes.map(({ id, name, values }) => ({
            id,
            key: id,
            name,
            values: values.map(({ value }) => value),
          }))
        : [emptyAttribute()],
    },
    validators: {
      onSubmit: category
        ? standardSchema(
            draftBody(t.Optional(CategoryModel.postBody.properties.file)),
          )
        : standardSchema(draftBody(CategoryModel.postBody.properties.file)),
    },
    onSubmitInvalid: focusFirstError,
    onSubmit: async ({ value: { attributes, file, name } }) => {
      if (!category) {
        const { data, error } = await api.categories.post({
          name,
          file: file as File,
          ...(attributes.length && {
            attributes: attributes.map(({ name: n, values }) => ({
              name: n,
              values,
            })),
          }),
        });
        if (error) {
          toastProblem(error.value);
          return;
        }
        toast.success("Category created.");
        onSaved(data);
        return;
      }
      const operations = attributeOperations(category.attributes, attributes);
      if (!(name !== category.name || file || operations)) {
        onSaved(category);
        return;
      }
      const { data, error } = await api.categories({ id: category.id }).patch({
        ...(name !== category.name && { name }),
        ...(file && { file }),
        ...(operations && { attributes: operations }),
      });
      if (error) {
        toastProblem(error.value);
        return;
      }
      toast.success("Category saved.");
      onSaved(data);
    },
  });

  return (
    <form action={submitOnce(form)} className="grid gap-6" noValidate>
      <DialogHeader>
        <DialogTitle className="first-letter:uppercase">
          {category ? category.name : "New Category"}
        </DialogTitle>
        <DialogDescription>
          Its attributes give the product's variants their values.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              autoComplete="off"
              label="Name"
              onChange={(e) => field.handleChange(e.target.value.toLowerCase())}
              placeholder="ground spices…"
              spellCheck={false}
            />
          )}
        </form.AppField>
        <form.Field name="file">
          {(field) => (
            <CategoryImage
              errors={field.state.meta.isTouched ? field.state.meta.errors : []}
              file={field.state.value}
              onChange={field.handleChange}
              url={category?.image.urlMedium}
            />
          )}
        </form.Field>
        <form.Field mode="array" name="attributes">
          {(list) => (
            <fieldset
              aria-labelledby="category-attributes"
              className="grid gap-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium" id="category-attributes">
                  Attributes
                </span>
                <Button
                  onClick={() => list.pushValue(emptyAttribute())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon data-icon="inline-start" />
                  Add Attribute
                </Button>
              </div>
              {list.state.value.length ? (
                <div
                  aria-hidden="true"
                  className={`${ROW} text-muted-foreground text-xs`}
                >
                  <span>Name</span>
                  <span>Values</span>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  None: products of this category have a single variant.
                </p>
              )}
              {list.state.value.map((attribute, index) => (
                <div className={ROW} key={attribute.key}>
                  <form.Field name={`attributes[${index}].name`}>
                    {(field) => {
                      const invalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={invalid}>
                          <Input
                            aria-invalid={invalid}
                            aria-label={`Attribute ${index + 1} name`}
                            autoComplete="off"
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(e) =>
                              field.handleChange(e.target.value.toLowerCase())
                            }
                            placeholder="weight…"
                            spellCheck={false}
                            value={field.state.value}
                          />
                          {invalid ? (
                            <FieldError errors={field.state.meta.errors} />
                          ) : null}
                        </Field>
                      );
                    }}
                  </form.Field>
                  <form.Field name={`attributes[${index}].values`}>
                    {(field) => {
                      const invalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;
                      return (
                        <Field data-invalid={invalid}>
                          <ValuesCombobox
                            id={field.name}
                            invalid={invalid}
                            label={`Attribute ${index + 1} values`}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                          {invalid ? (
                            <FieldError errors={field.state.meta.errors} />
                          ) : null}
                        </Field>
                      );
                    }}
                  </form.Field>
                  <Button
                    aria-label={`Remove attribute ${index + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => list.removeValue(index)}
                    size="icon"
                    title="Remove"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <FieldError errors={list.state.meta.errors} />
            </fieldset>
          )}
        </form.Field>
      </FieldGroup>

      <DialogFooter>
        {category && onDeleted ? (
          <ConfirmDelete
            className="sm:mr-auto"
            description="Its attributes and values are deleted with it. This cannot be undone."
            kind="Category"
            name={category.name}
            onConfirm={async () => {
              const { error } = await api
                .categories({ id: category.id })
                .delete();
              if (error) {
                toastProblem(error.value);
                return;
              }
              toast.success("Category deleted.");
              onDeleted(category.id);
            }}
          />
        ) : null}
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <SubmitButton>
          {category ? "Save Category" : "Create Category"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

function CategoryImage({
  errors,
  file,
  onChange,
  url,
}: {
  errors: ({ message?: string } | undefined)[];
  file?: File;
  onChange: (file: File) => void;
  url?: string;
}) {
  const src = useObjectUrl(file) ?? url;
  const invalid = errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="file">Image</FieldLabel>
      <label className="group border-input bg-muted/30 text-muted-foreground hover:bg-accent/50 has-focus-visible:ring-ring/50 has-aria-invalid:border-destructive relative flex h-44 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed text-center text-xs transition-colors has-focus-visible:ring-3">
        {src ? (
          <>
            <img
              alt=""
              className="absolute inset-0 size-full object-cover"
              height={176}
              src={src}
              width={528}
            />
            <span className="bg-background/85 text-foreground relative rounded-md px-2 py-1 font-medium opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
              Replace image
            </span>
          </>
        ) : (
          <>
            <span className="bg-background mb-1 flex size-10 items-center justify-center rounded-full border">
              <ImageIcon aria-hidden="true" className="size-4" />
            </span>
            <span className="text-foreground text-sm font-medium">
              Drop an image here
            </span>
            or click to browse, up to 7 MB
          </>
        )}
        <input
          accept="image/*"
          aria-invalid={invalid}
          className="absolute inset-0 cursor-pointer opacity-0"
          id="file"
          onChange={(e) => {
            const [picked] = e.target.files ?? [];
            if (picked) {
              onChange(picked);
            }
            e.target.value = "";
          }}
          type="file"
        />
      </label>
      <FieldError
        errors={
          file
            ? errors
            : errors.map(() => ({ message: "An image is required." }))
        }
      />
    </Field>
  );
}

function ValuesCombobox({
  id,
  invalid,
  label,
  onChange,
  value,
}: {
  id: string;
  invalid: boolean;
  label: string;
  onChange: (values: string[]) => void;
  value: string[];
}) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const check = typed ? valueSchema.validate(typed) : undefined;
  const problem =
    check && "issues" in check ? check.issues?.[0]?.message : undefined;
  const items =
    typed && !problem && !value.includes(typed) ? [typed, ...value] : value;
  return (
    <Combobox
      autoHighlight
      inputValue={query}
      items={items}
      multiple
      onInputValueChange={(next) => setQuery(next.toLowerCase())}
      onValueChange={(next: string[]) => {
        onChange(next);
        setQuery("");
      }}
      value={value}
    >
      <ComboboxChips ref={anchor}>
        {value.map((item) => (
          <ComboboxChip key={item}>{item}</ComboboxChip>
        ))}
        <ComboboxChipsInput
          aria-invalid={invalid}
          aria-label={label}
          id={id}
          placeholder={value.length ? "" : "100g, 250g…"}
          spellCheck={false}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty
          className={problem ? "text-destructive px-3" : undefined}
        >
          {problem ?? "Type a value to add it."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {value.includes(item) ? item : `Create "${item}"`}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
