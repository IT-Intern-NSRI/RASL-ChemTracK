// src/lib/prisma.ts
//
// Prisma client singleton. Next.js hot-reloads modules in dev, which would
// otherwise create a new PrismaClient (and a new DB connection pool) on
// every edit. Stashing the client on `globalThis` avoids that.
//
// This file is infrastructure wiring, not business logic — it's already
// complete and doesn't need to be filled in.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
