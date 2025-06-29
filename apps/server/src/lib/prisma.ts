import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/client";

const prismaClientSingleton = () => {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}

	const adapter = new PrismaPg({ connectionString: databaseUrl });
	return new PrismaClient({
		adapter,
	});
};

declare global {
	var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.__prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}
