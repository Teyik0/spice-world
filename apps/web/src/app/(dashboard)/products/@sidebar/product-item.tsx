"use client";

import { Badge } from "@spice-world/web/components/ui/badge";
import { Button } from "@spice-world/web/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@spice-world/web/components/ui/tooltip";
import { useAtom, useAtomValue } from "jotai";
import { MinusIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { newProductAtom, type ProductItemProps } from "../store";
import { statusVariants } from "./products-table";

export const NewProductItem = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newProduct = useAtomValue(newProductAtom);

  if (!newProduct) {
    return null;
  }

  const isSelected = pathname === "/products/new";
  const params = searchParams.toString();
  const href = `/products/new${params ? `?${params}` : ""}`;
  const firstLetter = (newProduct.name ?? "N")[0]?.toUpperCase() ?? "N";

  return (
    <Link
      className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full cursor-pointer items-start gap-3 border-b p-3 text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
      href={href}
    >
      {newProduct.img ? (
        <Image
          alt="New Product Image"
          className="shrink-0 rounded-md object-cover"
          height={48}
          src={newProduct.img}
          width={48}
        />
      ) : (
        <div className="bg-primary text-muted flex size-10 shrink-0 items-center justify-center rounded-md font-medium">
          {firstLetter}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div className="flex w-full items-center gap-2">
          <span className="truncate first-letter:capitalize">
            {newProduct.name || "New product"}
          </span>
          <Badge
            className="ml-auto shrink-0 bg-blue-500 text-xs font-semibold text-white dark:bg-blue-600"
            variant="secondary"
          >
            {(newProduct.status ?? "DRAFT").toLowerCase()}
          </Badge>
        </div>
        <span className="text-muted-foreground w-full truncate text-left text-xs font-medium">
          {(() => {
            const desc = newProduct.description || "";
            const maxChars = 50;
            return desc && desc.length > maxChars
              ? `${desc.slice(0, maxChars)}...`
              : desc;
          })()}
        </span>
      </div>
    </Link>
  );
};

export const ProductItem = ({ product }: { product: ProductItemProps }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isSelected = pathname.includes(product.slug);
  const params = searchParams.toString();
  const href = `/products/${product.slug}${params ? `?${params}` : ""}`;

  return (
    <Link
      className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full cursor-pointer items-start gap-3 border-b p-3 text-sm leading-tight last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
      href={href}
    >
      {product.img ? (
        <Image
          alt={product.name}
          className="shrink-0 rounded-md object-cover"
          height={48}
          loading="lazy"
          sizes="48px"
          src={product.img}
          width={48}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div className="flex w-full items-center gap-2">
          <span className="truncate first-letter:capitalize">
            {product.name}
          </span>
          <Badge
            className="ml-auto shrink-0 text-xs"
            variant={statusVariants[product.status]}
          >
            {product.status.toLowerCase()}
          </Badge>
        </div>
        <span className="text-muted-foreground w-full truncate text-left text-xs font-medium">
          {(() => {
            const desc = product.description;
            const maxChars = 50;
            return desc && desc.length > maxChars
              ? `${desc.slice(0, maxChars)}...`
              : desc;
          })()}
        </span>
      </div>
    </Link>
  );
};

export const AddProductButton = () => {
  const [newProduct, setNewProduct] = useAtom(newProductAtom);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = (reset = false) => {
    const params = searchParams.toString();
    if (reset) {
      setNewProduct(null);
      router.push(`/products${params ? `?${params}` : ""}`);
      return;
    }
    // Set initial new product state immediately so sidebar shows it
    setNewProduct({
      name: "",
      description: "",
      status: "DRAFT",
      img: null,
      categoryId: "",
      slug: "new",
    });
    router.push(`/products/new${params ? `?${params}` : ""}`);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              className="pl-2"
              onClick={() => handleClick(!!newProduct)}
              variant="outline"
            >
              {newProduct ? <MinusIcon /> : <PlusIcon />}
            </Button>
          }
        />
        <TooltipContent side="bottom">
          {newProduct ? <p>Delete new product</p> : <p>Add a new product</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
