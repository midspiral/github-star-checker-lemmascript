import type { RepositorySnapshot } from './cache.js'
import type { Stargazer } from './domain.js'

const API_ROOT = 'https://api.github.com'
const API_VERSION = '2026-03-10'
const MAX_SNAPSHOT_ATTEMPTS = 3

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface GitHubUser {
  login: string
  node_id: string
}

interface GitHubStar {
  starred_at: string
  user: GitHubUser
}

export interface GitHubClientOptions {
  token: string
  fetchImplementation?: FetchImplementation
  now?: () => Date
  maxSnapshotAttempts?: number
}

function repositoryPath(repo: string): string {
  const [owner, name] = repo.split('/')
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
}

function responseMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('message' in value)) return undefined
  return typeof value.message === 'string' ? value.message : undefined
}

async function throwResponseError(
  response: Response,
  repo: string,
  operation: string,
): Promise<never> {
  let detail = response.statusText
  try {
    const body: unknown = await response.json()
    detail = responseMessage(body) ?? detail
  } catch {
    // Keep the HTTP status text when GitHub did not return JSON.
  }
  throw new Error(`GitHub API error for ${repo} while ${operation}: ${response.status} ${detail}`)
}

function headers(token: string, accept: string): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'User-Agent': 'github-star-checker',
    'X-GitHub-Api-Version': API_VERSION,
  }
}

function nextPage(linkHeader: string | null): string | undefined {
  if (linkHeader === null) return undefined
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match === null) continue

    const url = new URL(match[1])
    if (url.origin !== API_ROOT) {
      throw new Error(`GitHub returned an unexpected pagination URL: ${url.origin}`)
    }
    return url.toString()
  }
  return undefined
}

function parseCount(value: unknown, repo: string): number {
  if (
    typeof value !== 'object'
    || value === null
    || !('stargazers_count' in value)
    || typeof value.stargazers_count !== 'number'
    || !Number.isSafeInteger(value.stargazers_count)
    || value.stargazers_count < 0
  ) {
    throw new Error(`GitHub returned a malformed stargazer count for ${repo}`)
  }
  return value.stargazers_count
}

function parseStars(value: unknown, repo: string): GitHubStar[] {
  if (!Array.isArray(value)) {
    throw new Error(`GitHub returned a malformed stargazer page for ${repo}`)
  }

  return value.map((item: unknown): GitHubStar => {
    if (
      typeof item !== 'object'
      || item === null
      || !('starred_at' in item)
      || typeof item.starred_at !== 'string'
      || !('user' in item)
      || typeof item.user !== 'object'
      || item.user === null
      || !('login' in item.user)
      || typeof item.user.login !== 'string'
      || !('node_id' in item.user)
      || typeof item.user.node_id !== 'string'
    ) {
      throw new Error(`GitHub returned a malformed stargazer entry for ${repo}`)
    }
    return {
      starred_at: item.starred_at,
      user: { login: item.user.login, node_id: item.user.node_id },
    }
  })
}

async function fetchCount(
  repo: string,
  token: string,
  fetchImplementation: FetchImplementation,
): Promise<number> {
  // Repository metadata is broadly available and has always exposed the same
  // authoritative count. The newer dedicated `/stargazers/count` route can
  // return 404 for repositories on which the listing itself is accessible.
  const url = `${API_ROOT}/repos/${repositoryPath(repo)}`
  const response = await fetchImplementation(url, {
    headers: headers(token, 'application/vnd.github+json'),
  })
  if (!response.ok) await throwResponseError(response, repo, 'reading repository metadata')
  return parseCount(await response.json(), repo)
}

async function fetchAllStargazers(
  repo: string,
  token: string,
  fetchImplementation: FetchImplementation,
): Promise<{ itemCount: number; stargazers: Stargazer[] }> {
  let url: string | undefined = `${API_ROOT}/repos/${repositoryPath(repo)}/stargazers?per_page=100`
  let itemCount = 0
  const stargazers = new Map<string, Stargazer>()

  while (url !== undefined) {
    const response = await fetchImplementation(url, {
      headers: headers(token, 'application/vnd.github.star+json'),
    })
    if (!response.ok) await throwResponseError(response, repo, 'listing stargazers')

    const page = parseStars(await response.json(), repo)
    itemCount += page.length
    for (const star of page) {
      stargazers.set(star.user.node_id, {
        id: star.user.node_id,
        login: star.user.login,
        starredAt: star.starred_at,
      })
    }
    url = nextPage(response.headers.get('link'))
  }

  return {
    itemCount,
    stargazers: [...stargazers.values()].sort((left, right) => left.id.localeCompare(right.id)),
  }
}

export async function fetchRepositorySnapshot(
  repo: string,
  options: GitHubClientOptions,
): Promise<RepositorySnapshot> {
  if (options.token.length === 0) {
    throw new Error('GITHUB_TOKEN is required to list individual stargazers')
  }

  const fetchImplementation = options.fetchImplementation ?? fetch
  const now = options.now ?? (() => new Date())
  const attempts = options.maxSnapshotAttempts ?? MAX_SNAPSHOT_ATTEMPTS
  let lastMismatch = ''

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const countBefore = await fetchCount(repo, options.token, fetchImplementation)
    const listing = await fetchAllStargazers(repo, options.token, fetchImplementation)
    const countAfter = await fetchCount(repo, options.token, fetchImplementation)

    if (listing.itemCount === 0 && countBefore > 0 && countBefore === countAfter) {
      throw new Error(
        `GitHub returned an empty stargazer list for non-empty ${repo}; `
        + 'the token may lack admin or collaborator access. The cache was not changed.',
      )
    }

    if (
      countBefore === countAfter
      && listing.itemCount === countAfter
      && listing.stargazers.length === countAfter
    ) {
      return {
        repo,
        fetchedAt: now().toISOString(),
        stargazers: listing.stargazers,
      }
    }

    lastMismatch = `count changed or pagination was inconsistent `
      + `(before=${countBefore}, rows=${listing.itemCount}, unique=${listing.stargazers.length}, after=${countAfter})`
  }

  throw new Error(
    `Could not obtain a consistent stargazer snapshot for ${repo} after ${attempts} attempt(s): ${lastMismatch}`,
  )
}

export async function fetchRepositorySnapshots(
  repos: string[],
  options: GitHubClientOptions,
): Promise<RepositorySnapshot[]> {
  return Promise.all(repos.map(repo => fetchRepositorySnapshot(repo, options)))
}
