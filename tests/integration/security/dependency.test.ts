// NFR-01, NFR-02: Check compatibility of the patched Prisma configuration dependencies.
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfigFromFile } from '@prisma/config'
import { expect, it } from 'vitest'

it('loads ordinary Prisma project configuration through the scoped patched merge and Effect dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task18-config-'))
  try {
    await writeFile(join(root, 'prisma.config.mjs'),
      'export default { schema: "./schema.prisma", migrations: { path: "./migrations" } }\n')

    const result = await loadConfigFromFile({ configRoot: root })

    expect(result.error).toBeUndefined()
    expect(result.config).toMatchObject({
      schema: join(root, 'schema.prisma'), migrations: { path: join(root, 'migrations') },
    })
  } finally {
    await rm(root, { recursive: true })
  }
})
