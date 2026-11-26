import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

export const SaveButton = ({
  children,
  isPending,
}: {
  children: React.ReactNode;
  isPending: boolean;
}) => (
  <Button disabled={isPending} type="submit" variant="secondary">
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
