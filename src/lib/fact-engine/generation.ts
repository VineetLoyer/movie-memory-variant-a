import 'server-only'

import type { FactProvider } from './types'

// FR-10, NFR-03: Bound generation; late results cannot write to storage.
export async function generateWithinDeadline(provider: FactProvider, movieTitle: string): Promise<string | null> {
  const controller = new AbortController()
  const deadline = Promise.withResolvers<null>()
  const timer = setTimeout(() => {
    console.warn('[facts] Generation unavailable.', { reason: 'timeout' })
    // Settle the deadline before abort listeners can resolve the losing request.
    deadline.resolve(null)
    controller.abort()
  }, 10_000)
  try {
    // Attach both handlers before racing. Late rejections are consumed; neither
    // losing branch has access to persistence or the coordination table.
    const generated = Promise.resolve().then(() => provider(movieTitle, controller.signal)).then(
      (output) => {
        if (typeof output === 'string' && output.trim()) return output.trim()
        if (!controller.signal.aborted) console.warn('[facts] Generation unavailable.', { reason: 'invalid_output' })
        return null
      },
      () => {
        if (!controller.signal.aborted) console.warn('[facts] Generation unavailable.', { reason: 'provider_error' })
        return null
      },
    )
    return await Promise.race([generated, deadline.promise])
  } finally {
    clearTimeout(timer)
  }
}
