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
import type { ComponentProps } from "react";
import { useTransition } from "react";

export function ConfirmDelete({
  description,
  kind,
  name,
  onConfirm,
  ...button
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  description: string;
  kind: string;
  name: string;
  onConfirm: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" variant="destructive" {...button} />}
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => startTransition(onConfirm)}
            variant="destructive"
          >
            Delete {kind}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
