import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let localPrisma: PrismaClient;

if (globalForPrisma.prisma) {
    localPrisma = globalForPrisma.prisma;
} else {
    const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    const adapter = new PrismaBetterSqlite3({ url: dbUrl });
    localPrisma = new PrismaClient({ adapter });
}

export const prisma = localPrisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = localPrisma;
