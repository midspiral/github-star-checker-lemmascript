#!/usr/bin/env npx tsx
// Trusted boundary: CLI wrapper for the verified star checker.
// Handles: argument parsing, GitHub API, state persistence, output formatting.
// Imports computeDiff / extractIncreases directly from the annotated source —
// no generated Dafny-JS runtime wrapper, because LemmaScript's Dafny is a
// verification side-car, not an upstream code-generation target.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeDiff, extractIncreases } from './domain.js'
import type { DiffReport } from './domain.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const STATE_FILE = path.resolve(__dirname, '..', '.stars-state.json')

// --- State persistence ---

interface State {
  counts: Record<string, number>
  lastRun: string
}

function loadState(): State {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  }
  return { counts: {}, lastRun: '' }
}

function saveState(state: State): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
}

// --- GitHub API ---

async function fetchStarCount(repo: string): Promise<number> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'github-star-checker',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers })
  if (!res.ok) {
    throw new Error(`GitHub API error for ${repo}: ${res.status} ${res.statusText}`)
  }
  const data = await res.json() as { stargazers_count: number }
  return data.stargazers_count
}

async function fetchAllStarCounts(repos: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    repos.map(async (repo) => {
      const count = await fetchStarCount(repo)
      return [repo, count] as const
    })
  )
  return Object.fromEntries(results)
}

// --- Output formatting ---

function formatTable(report: DiffReport, repos: string[]): string {
  const lines: string[] = []
  const repoWidth = Math.max(30, ...repos.map(r => r.length + 2))
  const header = 'repo'.padEnd(repoWidth) + 'stars'.padStart(10) + 'new'.padStart(8)
  const separator = '─'.repeat(header.length)

  lines.push(header)
  lines.push(separator)

  let totalStars = 0
  for (const row of report.rows) {
    const diffStr = row.diff >= 0 ? `+${row.diff}` : `${row.diff}`
    lines.push(
      row.repo.padEnd(repoWidth) +
      row.newCount.toLocaleString().padStart(10) +
      diffStr.padStart(8)
    )
    totalStars += row.newCount
  }

  lines.push(separator)
  const diffStr = report.totalDiff >= 0 ? `+${report.totalDiff}` : `${report.totalDiff}`
  lines.push(
    'total'.padEnd(repoWidth) +
    totalStars.toLocaleString().padStart(10) +
    diffStr.padStart(8)
  )

  return lines.join('\n')
}

// --- Notifications (macOS) ---
// Uses the verified extractIncreases to enumerate per-repo gains. The
// completeness postcondition guarantees no gainer is silently dropped;
// soundness guarantees no spurious repo is reported. Arguments pass as an
// argv array (execFileSync without a shell) so repo names cannot break the
// command string.

function notify(title: string, message: string): void {
  try {
    execFileSync('terminal-notifier', [
      '-title', title,
      '-message', message,
      '-sound', 'default',
    ])
  } catch (err: any) {
    console.error(`[notify] failed: ${err?.message ?? err}`)
  }
}

function notifyChanges(report: DiffReport): void {
  if (report.totalDiff === 0) return
  const gainers = extractIncreases(report)
  let message: string
  if (gainers.length > 0) {
    message = gainers.map(r => `${r.repo} +${r.diff}`).join(', ')
  } else {
    // Drops only — fall back to the aggregate figure.
    const sign = report.totalDiff > 0 ? '+' : ''
    message = `${sign}${report.totalDiff} stars`
  }
  notify('GitHub Stars', message)
}

// --- Main ---

async function runOnce(repos: string[]): Promise<DiffReport> {
  const state = loadState()

  console.log(`Fetching star counts for ${repos.length} repo(s)...`)
  const newCounts = await fetchAllStarCounts(repos)

  const report = computeDiff(repos, state.counts, newCounts)

  console.log('')
  console.log(formatTable(report, repos))

  const newState: State = {
    counts: { ...state.counts, ...newCounts },
    lastRun: new Date().toISOString(),
  }
  saveState(newState)
  console.log(`\nState saved to ${path.relative(process.cwd(), STATE_FILE)}`)

  return report
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs(args: string[]): { repos: string[]; watchMode: boolean; intervalMin: number } {
  let intervalMin = 10
  const filtered: string[] = []
  let watchMode = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') {
      watchMode = true
    } else if (args[i] === '--every' && i + 1 < args.length) {
      intervalMin = parseInt(args[++i], 10)
      if (isNaN(intervalMin) || intervalMin < 1) {
        console.error('--every requires a positive number of minutes')
        process.exit(1)
      }
    } else {
      filtered.push(args[i])
    }
  }

  return { repos: filtered, watchMode, intervalMin }
}

async function main() {
  const { repos, watchMode, intervalMin } = parseArgs(process.argv.slice(2))

  if (repos.length === 0) {
    console.error('Usage: stars [--watch [--every N]] owner/repo1 owner/repo2 ...')
    process.exit(1)
  }

  for (const repo of repos) {
    if (!repo.includes('/') || repo.split('/').length !== 2) {
      console.error(`Invalid repo format: ${repo} (expected owner/repo)`)
      process.exit(1)
    }
  }

  if (!watchMode) {
    await runOnce(repos)
    return
  }

  const intervalMs = intervalMin * 60_000
  console.log(`Watch mode: checking every ${intervalMin}min. Press Ctrl+C to stop.\n`)
  while (true) {
    try {
      const report = await runOnce(repos)
      notifyChanges(report)
    } catch (err: any) {
      console.error(`\nError: ${err.message}\n`)
    }
    const next = new Date(Date.now() + intervalMs)
    console.log(`\nNext check at ${next.toLocaleTimeString()}...\n`)
    await sleep(intervalMs)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
