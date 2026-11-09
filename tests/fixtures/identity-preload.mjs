// NFR-02, NFR-08: Inject controlled faults only in an explicitly started test process.
// TEST PROCESS ONLY. Preserve the actual Prisma client, adapter and query results.
// One explicitly owned session can execute a real PostgreSQL error during reads.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const client = require('@prisma/client')
const Original = client.PrismaClient
let token = null
process.on('message', message => {
  if (message?.kind !== 'identity-fault') return
  if (message.token !== null && typeof message.token !== 'string') throw new TypeError('Invalid scoped fault')
  token = message.token
  process.send?.({ kind: 'identity-fault-ready' })
})
client.PrismaClient = new Proxy(Original, {
  construct(target, args, newTarget) {
    const real = Reflect.construct(target, args, newTarget)
    return real.$extends({
      query: {
        session: {
          async findUnique({ args, query }) {
            if (token !== null && args.where.sessionToken === token) {
              return real.$queryRaw`SELECT 1 / 0`
            }
            return query(args)
          },
        },
      },
    })
  },
})
