import { drizzle } from "drizzle-orm/bun-sql";

import { relations } from "../drizzle/relations";
import { createDummyProducts } from "../tests/utils/dummy-products";

const db = drizzle({
  connection: process.env.DATABASE_URL as string,
  relations,
});
await createDummyProducts({ db });
await db.$client.close();
