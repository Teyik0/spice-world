import * as CollectionModel from "@spice-world/server/modules/collections/model";
import { Button } from "@spice-world/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
import { FieldGroup } from "@spice-world/ui/components/field";
import {
  focusFirstError,
  SubmitButton,
  submitOnce,
  useAppForm,
} from "@spice-world/ui/components/form";
import { standardSchema } from "@spice-world/ui/lib/schema";
import { t } from "elysia";
import { PencilIcon, XIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDelete } from "../../../../components/confirm-delete";
import { api } from "../../../../lib/api";

type Collection = CollectionModel.collectionResult;

const collectionBody = t.Omit(CollectionModel.postBody, ["productIds"]);

export function CollectionDialog({
  collection,
  onDeleted,
  onSaved,
  trigger,
}: {
  collection?: Collection;
  onDeleted?: (id: string) => void;
  onSaved: (collection: Collection) => void;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <CollectionForm
          collection={collection}
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

function CollectionForm({
  collection,
  onDeleted,
  onSaved,
}: {
  collection?: Collection;
  onDeleted?: (id: string) => void;
  onSaved: (collection: Collection) => void;
}) {
  const form = useAppForm({
    defaultValues: {
      name: collection?.name ?? "",
      handle: collection?.handle ?? "",
    },
    validators: { onSubmit: standardSchema(collectionBody) },
    onSubmitInvalid: focusFirstError,
    onSubmit: async ({ value }) => {
      if (!collection) {
        const { data, error } = await api.collections.post(value);
        if (error) {
          toast.error(error.value.detail ?? error.value.title);
          return;
        }
        toast.success("Collection created.");
        onSaved(data);
        return;
      }
      const changed = {
        ...(value.name !== collection.name && { name: value.name }),
        ...(value.handle !== collection.handle && { handle: value.handle }),
      };
      if (!Object.keys(changed).length) {
        onSaved(collection);
        return;
      }
      const { data, error } = await api
        .collections({ id: collection.id })
        .patch(changed, { headers: { "x-version": collection.version } });
      if (error) {
        toast.error(error.value.detail ?? error.value.title);
        return;
      }
      toast.success("Collection saved.");
      onSaved(data);
    },
  });

  return (
    <form action={submitOnce(form)} className="grid gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>
          {collection ? collection.name : "New Collection"}
        </DialogTitle>
        <DialogDescription>
          A curated list of products, shown in the store under its handle.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              autoComplete="off"
              label="Name"
              placeholder="Summer Grill…"
            />
          )}
        </form.AppField>
        <form.AppField name="handle">
          {(field) => (
            <field.TextField
              autoComplete="off"
              description="Lowercase letters, digits and dashes. Used in the store URL."
              label="Handle"
              placeholder="summer-grill…"
              spellCheck={false}
            />
          )}
        </form.AppField>
      </FieldGroup>
      <DialogFooter>
        {collection && onDeleted ? (
          <ConfirmDelete
            className="sm:mr-auto"
            description="Its products stay in the store; only the list is deleted. This cannot be undone."
            kind="Collection"
            name={collection.name}
            onConfirm={async () => {
              const { error } = await api
                .collections({ id: collection.id })
                .delete();
              if (error) {
                toast.error(error.value.detail ?? error.value.title);
                return;
              }
              toast.success("Collection deleted.");
              onDeleted(collection.id);
            }}
          />
        ) : null}
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <SubmitButton>
          {collection ? "Save Collection" : "Create Collection"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function ProductCollections({
  collections,
  onChange,
  onCollection,
  onDeleted,
  value,
}: {
  collections: Collection[];
  onChange: (ids: string[]) => void;
  onCollection: (collection: Collection) => void;
  onDeleted: (id: string) => void;
  value: string[];
}) {
  const names = new Map(collections.map(({ id, name }) => [id, name]));
  const selected = collections.filter(({ id }) => value.includes(id));
  return (
    <div className="grid gap-3">
      <Combobox
        items={collections.map(({ id }) => id)}
        itemToStringLabel={(id: string) => names.get(id) ?? ""}
        multiple
        onValueChange={onChange}
        value={value}
      >
        <ComboboxInput
          aria-label="Add to a collection"
          placeholder="Add to a collection…"
        />
        <ComboboxContent>
          <ComboboxEmpty>No collection found.</ComboboxEmpty>
          <ComboboxList>
            {(id: string) => (
              <ComboboxItem key={id} value={id}>
                {names.get(id)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {selected.length ? (
        <ul aria-label="Collections" className="grid gap-1">
          {selected.map((collection) => (
            <li
              className="hover:bg-muted/50 -mx-2 flex items-center gap-1 rounded-md py-1 pr-1 pl-2"
              key={collection.id}
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">
                  {collection.name}
                </span>
                <span className="text-muted-foreground truncate font-mono text-xs">
                  /{collection.handle}
                </span>
              </span>
              <CollectionDialog
                collection={collection}
                onDeleted={(id) => {
                  onDeleted(id);
                  onChange(value.filter((other) => other !== id));
                }}
                onSaved={onCollection}
                trigger={
                  <Button
                    aria-label={`Edit ${collection.name}`}
                    size="icon-sm"
                    title="Edit"
                    type="button"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                }
              />
              <Button
                aria-label={`Remove from ${collection.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChange(value.filter((id) => id !== collection.id))
                }
                size="icon-sm"
                title="Remove"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          In no collection: only found through search and its category.
        </p>
      )}
    </div>
  );
}
