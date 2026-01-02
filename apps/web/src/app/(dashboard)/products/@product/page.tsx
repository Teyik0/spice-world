import { PackageIcon } from "lucide-react";

export default function ProductPage() {
	return (
		<div className="flex flex-col items-center justify-center text-muted-foreground h-full">
			<PackageIcon className="size-16 stroke-1" />
			<p className="text-lg">Select a product to edit</p>
		</div>
	);
}
