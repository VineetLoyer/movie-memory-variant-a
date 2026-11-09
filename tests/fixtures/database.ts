// NFR-02, NFR-09: Test-only client; reject connections outside the separate test database.
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { PrismaClient } from '@prisma/client'

export class TestDatabaseConfigurationError extends Error {
  constructor() {
    super('Foundation requires the authorized local movie_memory_test database.')
    this.name = 'TestDatabaseConfigurationError'
  }
}

export async function openTestDatabase(): Promise<PrismaClient> {
  let connection: string
  try {
    const privateFile = parseEnv(await readFile(new URL('../../.env', import.meta.url), 'utf8'))
    const value = privateFile['TEST_DATABASE_URL']
    if (!value) throw new TestDatabaseConfigurationError()
    const url = new URL(value)
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
        url.port !== '5433' || decodeURIComponent(url.username) !== 'movie_memory_app' ||
        decodeURIComponent(url.pathname.slice(1)) !== 'movie_memory_test') {
      throw new TestDatabaseConfigurationError()
    }
    connection = value
  } catch (error) {
    // Private-file parsing is a boundary: never attach private input or causes.
    if (error instanceof TestDatabaseConfigurationError) throw error
    throw new TestDatabaseConfigurationError()
  }

  const db = new PrismaClient({ datasourceUrl: connection, log: [] })
  try {
    // NFR-02: Verify the connected database and role before tests can write.
    const identity = await db.$queryRaw<readonly { database: string; role: string }[]>`
      SELECT current_database() AS database, current_user AS role
    `
    if (identity.length !== 1 || identity[0]?.database !== 'movie_memory_test' ||
        identity[0]?.role !== 'movie_memory_app') {
      throw new TestDatabaseConfigurationError()
    }
    return db
  } catch (error) {
    await db.$disconnect()
    if (error instanceof TestDatabaseConfigurationError) throw error
    throw new TestDatabaseConfigurationError()
  }
}
