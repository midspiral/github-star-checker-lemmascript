import { diffStargazers } from './domain.js'
import type { Stargazer } from './domain.js'

// One observation of a repository. `stargazers` is undefined when GitHub only
// exposes the aggregate count to this token.
export interface Observation {
  count: number
  stargazers: Stargazer[] | undefined
}

export interface RepositoryChange {
  repo: string
  baseline: boolean
  // Whether `added` and `removed` are known; otherwise only the counts are.
  detailed: boolean
  oldCount: number
  newCount: number
  added: Stargazer[]
  removed: Stargazer[]
}

export function computeRepositoryChange(
  repo: string,
  previous: Observation | undefined,
  current: Observation,
): RepositoryChange {
  if (previous === undefined) {
    return {
      repo,
      baseline: true,
      detailed: current.stargazers !== undefined,
      oldCount: current.count,
      newCount: current.count,
      added: [],
      removed: [],
    }
  }

  if (previous.stargazers === undefined || current.stargazers === undefined) {
    return {
      repo,
      baseline: false,
      detailed: false,
      oldCount: previous.count,
      newCount: current.count,
      added: [],
      removed: [],
    }
  }

  const diff = diffStargazers(previous.stargazers, current.stargazers)
  return {
    repo,
    baseline: false,
    detailed: true,
    oldCount: previous.count,
    newCount: current.count,
    added: diff.added,
    removed: diff.removed,
  }
}

function netChange(change: RepositoryChange): number {
  return change.newCount - change.oldCount
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

function hasCountOnlyChange(change: RepositoryChange): boolean {
  return !change.detailed && netChange(change) !== 0
}

function tableLabel(change: RepositoryChange): string {
  return change.detailed ? change.repo : `${change.repo} (count)`
}

export function formatTable(changes: RepositoryChange[]): string {
  const lines: string[] = []
  const repoWidth = Math.max(30, ...changes.map(change => tableLabel(change).length + 2))
  const header = 'repo'.padEnd(repoWidth) + 'stars'.padStart(10) + 'new'.padStart(8)
  const separator = '─'.repeat(header.length)

  lines.push(header, separator)

  let totalStars = 0
  let totalDiff = 0
  for (const change of changes) {
    const diff = netChange(change)
    lines.push(
      tableLabel(change).padEnd(repoWidth)
      + change.newCount.toLocaleString().padStart(10)
      + signed(diff).padStart(8),
    )
    totalStars += change.newCount
    totalDiff += diff
  }

  lines.push(separator)
  lines.push(
    'total'.padEnd(repoWidth)
    + totalStars.toLocaleString().padStart(10)
    + signed(totalDiff).padStart(8),
  )

  return lines.join('\n')
}

function compareForDisplay(left: Stargazer, right: Stargazer): number {
  const byLogin = left.login.localeCompare(right.login, undefined, { sensitivity: 'base' })
  return byLogin !== 0 ? byLogin : left.id.localeCompare(right.id)
}

function logins(stargazers: Stargazer[]): string {
  return [...stargazers]
    .sort(compareForDisplay)
    .map(stargazer => `@${stargazer.login}`)
    .join(', ')
}

export function formatChangeDetails(changes: RepositoryChange[]): string {
  const lines: string[] = []
  for (const change of changes) {
    if (hasCountOnlyChange(change)) {
      lines.push(`${change.repo} (${signed(netChange(change))}/${change.newCount}, names unavailable)`)
      continue
    }
    if (change.added.length === 0 && change.removed.length === 0) continue
    const counts: string[] = []
    if (change.added.length > 0) counts.push(`+${change.added.length}`)
    if (change.removed.length > 0) counts.push(`-${change.removed.length}`)
    lines.push(`${change.repo} (${counts.join(' ')}/${change.newCount})`)
    if (change.added.length > 0) lines.push(`  new:  ${logins(change.added)}`)
    if (change.removed.length > 0) lines.push(`  lost: ${logins(change.removed)}`)
  }
  return lines.join('\n')
}

function compactGroup(prefix: '+' | '-', stargazers: Stargazer[], maximum: number): string {
  const sorted = [...stargazers].sort(compareForDisplay)
  const visible = sorted.slice(0, maximum).map(stargazer => `${prefix}@${stargazer.login}`)
  const hidden = sorted.length - visible.length
  if (hidden > 0) visible.push(`${prefix}${hidden} more`)
  return visible.join(', ')
}

export function notificationForChanges(
  changes: RepositoryChange[],
): { title: string; message: string } | undefined {
  const changed = changes.filter(change =>
    change.added.length > 0 || change.removed.length > 0 || hasCountOnlyChange(change))
  if (changed.length === 0) return undefined

  // Count-only repositories contribute their net change to one side.
  const totalAdded = changed.reduce((total, change) =>
    total + (change.detailed ? change.added.length : Math.max(netChange(change), 0)), 0)
  const totalRemoved = changed.reduce((total, change) =>
    total + (change.detailed ? change.removed.length : Math.max(-netChange(change), 0)), 0)
  const visibleRepositories = changed.slice(0, 3)
  const sections = visibleRepositories.map((change) => {
    if (!change.detailed) return `${change.repo}: ${signed(netChange(change))}`
    const groups: string[] = []
    if (change.added.length > 0) groups.push(compactGroup('+', change.added, 3))
    if (change.removed.length > 0) groups.push(compactGroup('-', change.removed, 3))
    return `${change.repo}: ${groups.join('; ')}`
  })
  if (changed.length > visibleRepositories.length) {
    sections.push(`${changed.length - visibleRepositories.length} more repo(s)`)
  }

  return {
    title: `GitHub Stars · +${totalAdded} / -${totalRemoved}`,
    message: sections.join(' · '),
  }
}
