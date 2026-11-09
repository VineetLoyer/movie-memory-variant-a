// NFR-02, NFR-08: Inject controlled faults only in an explicitly started test process.
// TEST PROCESS ONLY: normal application startup never imports this module.
const origin = new URL(process.env.MOVIE_MEMORY_TEST_PROVIDER_ORIGIN ?? '')
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' ||
    !origin.port || origin.username || origin.password || origin.pathname !== '/') {
  throw new TypeError('The controlled provider must use a loopback origin.')
}
const upstream = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.hostname !== 'api.openai.com') return upstream(input, init)
  const request = new Request(input, init)
  const headers = new Headers(request.headers)
  headers.delete('authorization')
  return upstream(new URL(url.pathname + url.search, origin), {
    method: request.method, headers, body: request.body,
    duplex: 'half', signal: request.signal,
  })
}
