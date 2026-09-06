import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { appDataPath } from "@/lib/app-paths";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

let localPrisma: PrismaClient;

if (globalForPrisma.prisma) {
    localPrisma = globalForPrisma.prisma;
} else {
    // Packaged (Electron) app: no writable project directory, so the DB lives
    // in the OS user-data dir instead of the "./dev.db" dev default.
    const dbUrl = process.env.DATABASE_URL ?? `file:${appDataPath("dev.db")}`;
    const adapter = new PrismaBetterSqlite3({ url: dbUrl });
    localPrisma = new PrismaClient({ adapter });
}

export const prisma = localPrisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = localPrisma;
