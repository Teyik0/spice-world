import { PackageIcon } from "lucide-react";

export default function ProductsMainSlot() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
      <PackageIcon className="size-16 stroke-1" />
      <p className="text-lg">Select a product to edit</p>
    </div>
  );
}
