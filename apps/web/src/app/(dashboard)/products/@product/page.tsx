import { PackageIcon } from "lucide-react";

export default function ProductPage() {
	return (
		<div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-muted-foreground gap-4">
			<PackageIcon className="size-16 stroke-1" />
			<p className="text-lg">Select a product to edit</p>
		</div>
	);
}
