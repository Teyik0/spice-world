import { Slot, component$, type PropsOf } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";

type TableProps = PropsOf<"table">;

export const Table = component$<TableProps>((props) => {
  return (
    <div class="relative w-full overflow-auto">
      <table class={cn("w-full caption-bottom text-sm", props.class)}>
        <Slot />
      </table>
    </div>
  );
});

type TableHeaderProps = PropsOf<"thead">;

export const TableHeader = component$<TableHeaderProps>((props) => {
  return (
    <thead class={cn("[&_tr]:border-b", props.class)}>
      <Slot />
    </thead>
  );
});

type TableBodyProps = PropsOf<"tbody">;

export const TableBody = component$<TableBodyProps>((props) => {
  return (
    <tbody class={cn("[&_tr:last-child]:border-0", props.class)}>
      <Slot />
    </tbody>
  );
});

type TableFooterProps = PropsOf<"tfoot">;

export const TableFooter = component$<TableFooterProps>((props) => {
  return (
    <tfoot
      class={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        props.class,
      )}
    >
      <Slot />
    </tfoot>
  );
});

type TableRowProps = PropsOf<"tr">;

export const TableRow = component$<TableRowProps>((props) => {
  return (
    <tr
      class={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        props.class,
      )}
    >
      <Slot />
    </tr>
  );
});

type TableHeadProps = PropsOf<"th">;

export const TableHead = component$<TableHeadProps>((props) => {
  return (
    <th
      class={cn(
        "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        props.class,
      )}
    >
      <Slot />
    </th>
  );
});

type TableCellProps = PropsOf<"td">;

export const TableCell = component$<TableCellProps>((props) => {
  return (
    <td
      class={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        props.class,
      )}
    >
      <Slot />
    </td>
  );
});

type TableCaptionProps = PropsOf<"caption">;

export const TableCaption = component$<TableCaptionProps>((props) => {
  return (
    <caption class={cn("mt-4 text-sm text-muted-foreground", props.class)}>
      <Slot />
    </caption>
  );
});
