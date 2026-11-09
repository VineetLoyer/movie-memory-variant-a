// FR-07, FR-08, FR-10, NFR-08: Types for scoped storage, cache snapshots, and provider output.
export type FactScope = Readonly<{ userId: string; movieTitle: string }>
export type StoredFact = Readonly<{ id: string; text: string; createdAt: Date }>
export type FactSnapshot = Readonly<{ databaseNow: Date; latest: StoredFact | null }>

export interface FactStore {
  readLatest(scope: FactScope): Promise<FactSnapshot>
  insert(scope: FactScope, text: string): Promise<StoredFact>
}

export type FactProvider = (movieTitle: string, signal: AbortSignal) => Promise<unknown>
