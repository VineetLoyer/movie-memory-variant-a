// FR-07, NFR-03, NFR-08: Exercise the real SDK with controlled network responses.
import { afterEach, expect, it, vi } from 'vitest'
import { generateMovieFact } from '../../src/lib/fact-engine/provider'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('uses the actual SDK with controlled transport and never retries a 503', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'harmless-process-only-key')
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ error: { message: 'controlled unavailable' } }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', transport)
  await expect(generateMovieFact('Arrival', new AbortController().signal)).rejects.toBeInstanceOf(Error)
  expect(transport).toHaveBeenCalledTimes(1)
})

it('extracts the real SDK wire response without a paid request', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'harmless-process-only-key')
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    id: 'controlled', object: 'chat.completion', created: 0, model: 'controlled',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Wire fact' } }],
  }), { headers: { 'Content-Type': 'application/json' } })))
  expect(await generateMovieFact('Arrival', new AbortController().signal)).toBe('Wire fact')
})
