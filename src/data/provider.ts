import { hasTmdbToken } from './tmdb/client'
import { localProvider, matchesFilters } from './providers/local'
import { tmdbProvider } from './providers/tmdb'
import type { CatalogProvider } from './providers/types'

/**
 * TMDB is the primary catalogue. The bundled 91-title demo set is only used
 * when no token is configured, so the app still runs (and demos) offline.
 */
export const catalogProvider: CatalogProvider = hasTmdbToken ? tmdbProvider : localProvider

export const usingTmdb = hasTmdbToken

export { matchesFilters, localProvider }
export type { CatalogProvider, Page, Recommendation, DiscoveryRequest } from './providers/types'
