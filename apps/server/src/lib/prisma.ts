import { PrismaClient } from '../prisma/client'

const prismaClientSingleton = () => {
  // const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env['NODE_ENV'] !== 'production') globalThis.prisma = prisma
