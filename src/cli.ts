#!/usr/bin/env npx tsx
// Trusted boundary: argument parsing, GitHub I/O, cache persistence, output,
// and macOS notifications. Identity reconciliation lives in domain.ts.

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadCache,
  mergeSnapshots,
  saveCache,
  snapshotToStargazers,
} from './cache.js'
import type { RepositorySnapshot } from './cache.js'
import type { Stargazer } from './domain.js'
import { fetchRepositorySnapshots } from './github.js'
import { computeRepositoryChange } from './domain.js'
import type { Observation, RepositoryChange } from './domain.js'
import {
  formatChangeDetails,
  formatTable,
  notificationForChanges,
} from './presentation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE = path.resolve(__dirname, '..', '.stargazers-cache.json')

function notify(title: string, message: string): void {
  try {
    execFileSync('terminal-notifier', [
      '-title', title,
      '-message', message,
      '-sound', 'default',
    ])
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[notify] failed: ${detail}`)
  }
}

function observation(count: number, stargazers: Stargazer[] | undefined): Observation {
  return stargazers === undefined
    ? { kind: 'counted', count }
    : { kind: 'listed', stargazers }
}

function changesForSnapshots(
  repos: string[],
  snapshots: RepositorySnapshot[],
  cache: ReturnType<typeof loadCache>,
): RepositoryChange[] {
  const snapshotsByRepo = new Map(snapshots.map(snapshot => [snapshot.repo, snapshot]))
  return repos.map((repo) => {
    const current = snapshotsByRepo.get(repo)
    if (current === undefined) throw new Error(`Missing fetched snapshot for ${repo}`)
    const cached = cache.repositories[repo]
    const previous = cached === undefined
      ? undefined
      : observation(cached.count, snapshotToStargazers(cached))
    return computeRepositoryChange(repo, previous, observation(current.count, current.stargazers))
  })
}

async function runOnce(repos: string[], token: string): Promise<RepositoryChange[]> {
  const cache = loadCache(CACHE_FILE)

  console.log(`Fetching stargazers for ${repos.length} repo(s)...`)
  const snapshots = await fetchRepositorySnapshots(repos, { token })
  const changes = changesForSnapshots(repos, snapshots, cache)

  console.log('')
  console.log(formatTable(changes))

  const details = formatChangeDetails(changes)
  if (details.length > 0) {
    console.log('')
    console.log(details)
  }

  const updatedAt = new Date().toISOString()
  saveCache(CACHE_FILE, mergeSnapshots(cache, snapshots, updatedAt))
  console.log(`\nCache saved to ${path.relative(process.cwd(), CACHE_FILE)}`)

  return changes
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs(args: string[]): { repos: string[]; watchMode: boolean; intervalMin: number } {
  let intervalMin = 10
  const repos: string[] = []
  let watchMode = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') {
      watchMode = true
    } else if (args[i] === '--every' && i + 1 < args.length) {
      intervalMin = Number.parseInt(args[++i], 10)
      if (!Number.isFinite(intervalMin) || intervalMin < 1) {
        throw new Error('--every requires a positive number of minutes')
      }
    } else {
      repos.push(args[i])
    }
  }

  return { repos, watchMode, intervalMin }
}

function validateRepos(repos: string[]): void {
  if (repos.length === 0) {
    throw new Error('Usage: stars [--watch [--every N]] owner/repo1 owner/repo2 ...')
  }

  const seen = new Set<string>()
  for (const repo of repos) {
    const parts = repo.split('/')
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      throw new Error(`Invalid repo format: ${repo} (expected owner/repo)`)
    }
    if (seen.has(repo)) throw new Error(`Duplicate repo: ${repo}`)
    seen.add(repo)
  }
}

async function main(): Promise<void> {
  const { repos, watchMode, intervalMin } = parseArgs(process.argv.slice(2))
  validateRepos(repos)

  const token = process.env.GITHUB_TOKEN
  if (token === undefined || token.length === 0) {
    throw new Error('GITHUB_TOKEN is required to list individual stargazers')
  }

  if (!watchMode) {
    await runOnce(repos, token)
    return
  }

  const intervalMs = intervalMin * 60_000
  console.log(`Watch mode: checking every ${intervalMin}min. Press Ctrl+C to stop.\n`)
  while (true) {
    try {
      const changes = await runOnce(repos, token)
      const notification = notificationForChanges(changes)
      if (notification !== undefined) notify(notification.title, notification.message)
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`\nError: ${detail}\n`)
    }
    const next = new Date(Date.now() + intervalMs)
    console.log(`\nNext check at ${next.toLocaleTimeString()}...\n`)
    await sleep(intervalMs)
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(detail)
  process.exit(1)
})
