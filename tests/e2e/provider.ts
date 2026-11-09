// FR-09, FR-10, NFR-08: Control held, failed, and successful provider responses for browser tests.
import type { IncomingMessage, ServerResponse } from 'node:http'

export function controlledProvider() {
  let mode = 'success'
  let text = 'The controlled production fact was persisted before display.'
  let calls = 0
  const pending = new Set<ServerResponse>()
  const answer = (response: ServerResponse) => {
    if (response.destroyed) return
    response.writeHead(mode === 'error' ? 503 : 200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(mode === 'error'
      ? { error: { message: 'Controlled upstream failure' } }
      : {
        id: 'controlled', object: 'chat.completion', created: 0, model: 'controlled',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }],
      }))
  }
  return {
    configure(next: string, fact: string) {
      if (!['success', 'error', 'hold', 'timeout'].includes(next)) throw new TypeError('Invalid provider plan')
      if (pending.size) throw new TypeError('A prior provider request is still active')
      mode = next
      text = fact
      calls = 0
    },
    release() {
      mode = 'success'
      for (const response of pending) answer(response)
      pending.clear()
    },
    stats: () => ({ calls, pending: pending.size }),
    handle(request: IncomingMessage, response: ServerResponse) {
      if (request.headers.authorization) throw new TypeError('Preload forwarded authorization')
      calls += 1
      request.resume()
      if (mode === 'hold' || mode === 'timeout') {
        pending.add(response)
        // Remote work may outlive client cancellation. Own the fault's lifetime.
        const deadline = mode === 'timeout' ? setTimeout(() => response.destroy(), 20_000) : null
        response.once('close', () => {
          if (deadline) clearTimeout(deadline)
          pending.delete(response)
        })
      } else answer(response)
    },
    close() {
      for (const response of pending) response.destroy()
      pending.clear()
    },
  }
}
