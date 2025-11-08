"use client";

import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { GetProduct, PostProduct } from "@/lib/product";

export const ProductCard = ({
	product,
	isNew = false,
}: {
	product: GetProduct | PostProduct;
	isNew: boolean;
}) => {
	const router = useRouter();
	const handleClick = () => {
		if ("slug" in product) {
			router.push(`/dashboard/products/${product.slug}`);
		} else {
			router.push("/dashboard/products/new");
		}
	};

	const pathname = usePathname();
	const isSelected =
		"slug" in product ? pathname.includes(product.slug) : "new";

	return (
		<button
			type="button"
			key={"id" in product ? product.id : "new-product"}
			className={`w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4
			text-sm leading-tight whitespace-nowrap last:border-b-0 ${isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
			onClick={handleClick}
		>
			<div className="flex w-full items-center gap-2">
				<span>{product.name}</span>
				<Badge
					variant="secondary"
					className="bg-blue-500 text-white font-semibold dark:bg-blue-600 ml-auto text-xs"
				>
					{isNew ? "new" : product.status?.toLowerCase()}
				</Badge>
			</div>
			<span className="font-medium">{product.description}</span>
		</button>
	);
};
