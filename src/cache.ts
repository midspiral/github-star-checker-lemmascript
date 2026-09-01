import fs from 'node:fs'

import type { Stargazer } from './domain.js'

export const CACHE_VERSION = 1 as const

export interface CachedStargazer {
  login: string
  starredAt: string
}

export interface CachedRepository {
  fetchedAt: string
  stargazers: Record<string, CachedStargazer>
}

export interface StargazerCache {
  version: typeof CACHE_VERSION
  updatedAt: string
  repositories: Record<string, CachedRepository>
}

export interface RepositorySnapshot {
  repo: string
  fetchedAt: string
  stargazers: Stargazer[]
}

export function emptyCache(): StargazerCache {
  return { version: CACHE_VERSION, updatedAt: '', repositories: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCache(value: unknown, cacheFile: string): StargazerCache {
  if (!isRecord(value) || value.version !== CACHE_VERSION) {
    throw new Error(`${cacheFile} is not a supported stargazer cache (expected version ${CACHE_VERSION})`)
  }
  if (typeof value.updatedAt !== 'string' || !isRecord(value.repositories)) {
    throw new Error(`${cacheFile} is malformed`)
  }

  const repositories: Record<string, CachedRepository> = {}
  for (const [repo, rawRepository] of Object.entries(value.repositories)) {
    if (!isRecord(rawRepository) || typeof rawRepository.fetchedAt !== 'string' || !isRecord(rawRepository.stargazers)) {
      throw new Error(`${cacheFile} has a malformed snapshot for ${repo}`)
    }

    const stargazers: Record<string, CachedStargazer> = {}
    for (const [id, rawStargazer] of Object.entries(rawRepository.stargazers)) {
      if (
        id.length === 0
        || !isRecord(rawStargazer)
        || typeof rawStargazer.login !== 'string'
        || rawStargazer.login.length === 0
        || typeof rawStargazer.starredAt !== 'string'
      ) {
        throw new Error(`${cacheFile} has a malformed stargazer in ${repo}`)
      }
      stargazers[id] = {
        login: rawStargazer.login,
        starredAt: rawStargazer.starredAt,
      }
    }

    repositories[repo] = {
      fetchedAt: rawRepository.fetchedAt,
      stargazers,
    }
  }

  return {
    version: CACHE_VERSION,
    updatedAt: value.updatedAt,
    repositories,
  }
}

export function loadCache(cacheFile: string): StargazerCache {
  if (!fs.existsSync(cacheFile)) return emptyCache()

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ${cacheFile}: ${detail}`)
  }
  return parseCache(parsed, cacheFile)
}

export function snapshotToStargazers(snapshot: CachedRepository): Stargazer[] {
  return Object.entries(snapshot.stargazers)
    .map(([id, value]): Stargazer => ({ id, login: value.login, starredAt: value.starredAt }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function cacheRepository(snapshot: RepositorySnapshot): CachedRepository {
  const sorted = [...snapshot.stargazers].sort((left, right) => left.id.localeCompare(right.id))
  const stargazers: Record<string, CachedStargazer> = {}

  for (const stargazer of sorted) {
    if (stargazer.id in stargazers) {
      throw new Error(`GitHub returned duplicate stargazer ID ${stargazer.id} for ${snapshot.repo}`)
    }
    stargazers[stargazer.id] = {
      login: stargazer.login,
      starredAt: stargazer.starredAt,
    }
  }

  return { fetchedAt: snapshot.fetchedAt, stargazers }
}

export function mergeSnapshots(
  cache: StargazerCache,
  snapshots: RepositorySnapshot[],
  updatedAt: string,
): StargazerCache {
  const repositories: Record<string, CachedRepository> = { ...cache.repositories }
  for (const snapshot of snapshots) {
    repositories[snapshot.repo] = cacheRepository(snapshot)
  }

  const sortedRepositories = Object.fromEntries(
    Object.entries(repositories).sort(([left], [right]) => left.localeCompare(right)),
  )

  return {
    version: CACHE_VERSION,
    updatedAt,
    repositories: sortedRepositories,
  }
}

export function saveCache(cacheFile: string, cache: StargazerCache): void {
  const temporaryFile = `${cacheFile}.tmp-${process.pid}`
  const contents = `${JSON.stringify(cache, null, 2)}\n`

  try {
    fs.writeFileSync(temporaryFile, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    fs.renameSync(temporaryFile, cacheFile)
  } catch (error: unknown) {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not save ${cacheFile}: ${detail}`)
  }
}
