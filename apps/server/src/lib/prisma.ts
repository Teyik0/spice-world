import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/client";

const prismaClientSingleton = () => {
	const connectionString = Bun.env.DATABASE_URL;
	const adapter =
		Bun.env.NODE_ENV !== "production"
			? new PrismaPg({ connectionString })
			: new PrismaNeon({ connectionString });
	return new PrismaClient({
		adapter,
	});
};

declare global {
	var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Export a getter that always returns the current global prisma client
// This allows tests to replace globalThis.__prisma and have it reflected here
// The client is created lazily on first access, not at module load time
export const prisma = new Proxy({} as PrismaClient, {
	get(_, prop) {
		if (!globalThis.__prisma) {
			globalThis.__prisma = prismaClientSingleton();
		}
		// biome-ignore lint/suspicious/noExplicitAny: Prisma client proxy requires dynamic property access
		return (globalThis.__prisma as any)[prop];
	},
});
