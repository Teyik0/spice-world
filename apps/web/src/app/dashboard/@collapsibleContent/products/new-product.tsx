"use client";

import { useAtom, useAtomValue } from "jotai";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { productAtom } from "@/lib/product";
import { ProductCard } from "./product";

export const AddProductButton = () => {
	const [newProduct, setNewProduct] = useAtom(productAtom);
	const router = useRouter();

	const handleClick = (reset: boolean = false) => {
		if (reset) {
			setNewProduct(null);
			router.push("/dashboard/products");
			return;
		}

		router.push("/dashboard/products/new");
	};

	// If new product defined, show delete button
	if (newProduct)
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={() => handleClick(true)}
							variant="outline"
							className="pl-2"
						>
							<MinusIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">
						<p>Delete new product</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						onClick={() => handleClick(false)}
						variant="outline"
						className="pl-2"
					>
						<PlusIcon />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="right">
					<p>Add a new product</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

export const NewProduct = () => {
	const product = useAtomValue(productAtom);
	if (product === null) return;
	return <ProductCard product={product} isNew />;
};
