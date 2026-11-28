import { SQL } from "bun";
import { DrizzleQueryError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import type { HTTPError } from "elysia";

import { relations } from "../../drizzle/relations";
import { env } from "./env";

export const db = drizzle({
  connection: env.DATABASE_URL,
  relations,
});

type ConstraintFailure = (new () => HTTPError) & {
  constraints: readonly string[];
};

export async function catchConstraints<
  T,
  const F extends readonly ConstraintFailure[],
>(failures: F, write: Promise<T>): Promise<T | InstanceType<F[number]>> {
  try {
    return await write;
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error;
    const Failure =
      cause instanceof SQL.PostgresError &&
      failures.find(({ constraints }) =>
        constraints.includes(`${cause.errno}:${cause.constraint}`),
      );
    if (Failure) {
      return new Failure() as InstanceType<F[number]>;
    }
    throw error;
  }
}
