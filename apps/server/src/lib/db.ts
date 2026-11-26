import { drizzle } from "drizzle-orm/bun-sql";

import { relations } from "../../drizzle/relations";
import { env } from "./env";

export interface ConstraintFailure {
  code: string;
  message: string;
  status: 400 | 409;
}

export const db = drizzle({
  connection: env.DATABASE_URL,
  relations,
});
