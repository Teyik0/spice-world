import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/client";

const prismaClientSingleton = () => {
	if (!Bun.env.DATABASE_URL) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}

	const adapter = new PrismaPg({ connectionString: Bun.env.DATABASE_URL });
	return new PrismaClient({
		adapter,
	});
};

declare global {
	var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.__prisma ?? prismaClientSingleton();

if (Bun.env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}
