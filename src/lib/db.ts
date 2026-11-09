// NFR-02: Keep database access out of Client Components.
import 'server-only'

import { PrismaClient } from '@prisma/client'

// NFR-01: Provide one Prisma client for PostgreSQL access.
const globalForPrisma: typeof globalThis & { prisma?: PrismaClient } = globalThis

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Reuse the client across development hot reloads so they do not open new pools.
if (process.env['NODE_ENV'] !== 'production') globalForPrisma.prisma = prisma
