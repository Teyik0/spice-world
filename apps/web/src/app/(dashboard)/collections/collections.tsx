import type * as CollectionModel from "@spice-world/server/modules/collections/model";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@spice-world/web/components/ui/card";

interface CollectionsProps {
  collections: CollectionModel.collectionResult[];
}

export function Collections({ collections }: CollectionsProps) {
  if (collections.length === 0) {
    return <p className="text-muted-foreground p-4">No collections yet.</p>;
  }

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((collection) => (
        <Card key={collection.id}>
          <CardHeader>
            <CardTitle>{collection.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              /{collection.handle}
            </p>
            <p className="text-sm">
              {collection.productIds.length}{" "}
              {collection.productIds.length === 1 ? "product" : "products"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
