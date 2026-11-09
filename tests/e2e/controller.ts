// NFR-08: Support repeatable checks without changing production code.
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { PrismaClient } from '@prisma/client'
import { seedSession } from '../fixtures/session.ts'
import { controlledProvider } from './provider.ts'

export function controller(database: PrismaClient, signature: string) {
  const ids: string[] = []
  const provider = controlledProvider()
  const controlKey = randomUUID()
  let child: ChildProcess | undefined
  return {
    controlKey, provider, bind(server: ChildProcess) { child = server },
    async handle(request: IncomingMessage, response: ServerResponse) {
      if (request.url === '/v1/chat/completions') return provider.handle(request, response)
      if (request.headers['x-e2e-control'] !== controlKey) {
        response.writeHead(403).end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      if (typeof input !== 'object' || input === null) throw new TypeError('Invalid control body')
      let result: object
      switch (request.url) {
        case '/fixture': {
          if (!('movie' in input) || !(input.movie === null || typeof input.movie === 'string')) {
            throw new TypeError('Invalid fixture movie')
          }
          const id = signature + randomUUID()
          ids.push(id)
          const session = await seedSession(database, { id, favoriteMovie: input.movie })
          if ('expired' in input && input.expired === true) {
            await database.session.updateMany({ where: { userId: id }, data: { expires: new Date(0) } })
          }
          if ('missing' in input && input.missing === true) {
            await database.user.update({ where: { id }, data: { name: null, email: null, image: null } })
          }
          result = { id, token: session.sessionToken, cookieName: session.cookieName }
          break
        }
        case '/plan':
          if (!('mode' in input) || typeof input.mode !== 'string' ||
              !('text' in input) || typeof input.text !== 'string') throw new TypeError('Invalid plan')
          provider.configure(input.mode, input.text)
          result = provider.stats()
          break
        case '/release':
          provider.release()
          result = provider.stats()
          break
        case '/stats':
          result = provider.stats()
          break
        default: {
          if (!('id' in input) || typeof input.id !== 'string' || !ids.includes(input.id)) {
            throw new TypeError('Control requires an owned fixture')
          }
          const id = input.id
          switch (request.url) {
            case '/state':
              result = {
                user: await database.user.findUnique({ where: { id }, select: { favoriteMovie: true } }),
                facts: await database.movieFact.findMany({ where: { userId: id }, select: { text: true } }),
                sessions: await database.session.count({ where: { userId: id } }),
              }
              break
            case '/age':
              await database.movieFact.updateMany({
                where: { userId: id }, data: { createdAt: new Date(Date.now() - 61_000) },
              })
              result = {}
              break
            case '/identity-fault': {
              if (!child) throw new TypeError('Missing owned server')
              const session = await database.session.findFirstOrThrow({ where: { userId: id } })
              const acknowledged = once(child, 'message')
              child.send({ kind: 'identity-fault', token: 'enabled' in input && input.enabled ? session.sessionToken : null })
              await acknowledged
              result = {}
              break
            }
            default: throw new TypeError('Unknown control')
          }
        }
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    },
    async cleanup() {
      provider.close()
      const owners = { in: ids }
      await database.user.deleteMany({ where: { id: owners } })
      return {
        facts: await database.movieFact.count({ where: { userId: owners } }),
        sessions: await database.session.count({ where: { userId: owners } }),
        accounts: await database.account.count({ where: { userId: owners } }),
        users: await database.user.count({ where: { id: owners } }),
      }
    },
  }
}
