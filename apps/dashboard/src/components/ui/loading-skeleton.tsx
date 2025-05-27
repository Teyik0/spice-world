import { component$, type PropsOf } from "@qwik.dev/core";
import { cn } from "@qwik-ui/utils";

export const LoadingSkeleton = component$<PropsOf<"div">>(({ ...props }) => {
  return (
    <div
      {...props}
      class={cn("animate-pulse rounded-md bg-muted", props.class)}
    />
  );
});

export const TableLoadingSkeleton = component$(() => {
  return (
    <div class="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} class="flex items-center space-x-4 p-4">
          <LoadingSkeleton class="h-10 w-10 rounded-full" />
          <div class="space-y-2 flex-1">
            <LoadingSkeleton class="h-4 w-1/4" />
            <LoadingSkeleton class="h-3 w-1/6" />
          </div>
          <LoadingSkeleton class="h-6 w-16" />
          <LoadingSkeleton class="h-6 w-20" />
          <LoadingSkeleton class="h-4 w-16" />
          <div class="flex space-x-2">
            <LoadingSkeleton class="h-8 w-8" />
            <LoadingSkeleton class="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
});

export const UserCardSkeleton = component$(() => {
  return (
    <div class="p-6 border rounded-lg space-y-4">
      <div class="flex items-center space-x-4">
        <LoadingSkeleton class="h-12 w-12 rounded-full" />
        <div class="space-y-2 flex-1">
          <LoadingSkeleton class="h-4 w-32" />
          <LoadingSkeleton class="h-3 w-48" />
        </div>
      </div>
      <div class="flex justify-between items-center">
        <LoadingSkeleton class="h-6 w-16" />
        <div class="flex space-x-2">
          <LoadingSkeleton class="h-8 w-16" />
          <LoadingSkeleton class="h-8 w-16" />
        </div>
      </div>
    </div>
  );
});