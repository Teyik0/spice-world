import { Suspense } from "react";
import { SignUpFormSkeleton } from "../skeletons";
import { SignUp } from "./signup";

export default function page() {
	return (
		<Suspense fallback={<SignUpFormSkeleton />}>
			<SignUp />
		</Suspense>
	);
}
