/** FR-11, NFR-02: Safe error text without private adapter or provider causes. */
export class AuthenticationUnavailableError extends Error {
  constructor() {
    super('Authentication is temporarily unavailable.')
    this.name = 'AuthenticationUnavailableError'
  }
}
