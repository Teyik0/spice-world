import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

export const SaveButton = ({
	children,
	isPending,
}: {
	children: React.ReactNode;
	isPending: boolean;
}) => {
	return (
		<Button type="submit" variant="secondary" disabled={isPending}>
			{isPending ? (
				<>
					<Spinner />
					Saving...
				</>
			) : (
				children
			)}
		</Button>
	);
};
