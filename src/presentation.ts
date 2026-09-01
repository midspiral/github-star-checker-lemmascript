import { diffStargazers } from './domain.js'
import type { Stargazer } from './domain.js'

export interface RepositoryChange {
  repo: string
  baseline: boolean
  oldCount: number
  newCount: number
  added: Stargazer[]
  removed: Stargazer[]
}

export function computeRepositoryChange(
  repo: string,
  previous: Stargazer[] | undefined,
  current: Stargazer[],
): RepositoryChange {
  if (previous === undefined) {
    return {
      repo,
      baseline: true,
      oldCount: current.length,
      newCount: current.length,
      added: [],
      removed: [],
    }
  }

  const diff = diffStargazers(previous, current)
  return {
    repo,
    baseline: false,
    oldCount: previous.length,
    newCount: current.length,
    added: diff.added,
    removed: diff.removed,
  }
}

export function formatTable(changes: RepositoryChange[]): string {
  const lines: string[] = []
  const repoWidth = Math.max(30, ...changes.map(change => change.repo.length + 2))
  const header = 'repo'.padEnd(repoWidth) + 'stars'.padStart(10) + 'new'.padStart(8)
  const separator = '─'.repeat(header.length)

  lines.push(header, separator)

  let totalStars = 0
  let totalDiff = 0
  for (const change of changes) {
    const diff = change.newCount - change.oldCount
    const diffText = diff >= 0 ? `+${diff}` : `${diff}`
    lines.push(
      change.repo.padEnd(repoWidth)
      + change.newCount.toLocaleString().padStart(10)
      + diffText.padStart(8),
    )
    totalStars += change.newCount
    totalDiff += diff
  }

  lines.push(separator)
  const totalDiffText = totalDiff >= 0 ? `+${totalDiff}` : `${totalDiff}`
  lines.push(
    'total'.padEnd(repoWidth)
    + totalStars.toLocaleString().padStart(10)
    + totalDiffText.padStart(8),
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
    if (change.added.length === 0 && change.removed.length === 0) continue
    lines.push(change.repo)
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
  const changed = changes.filter(change => change.added.length > 0 || change.removed.length > 0)
  if (changed.length === 0) return undefined

  const totalAdded = changed.reduce((total, change) => total + change.added.length, 0)
  const totalRemoved = changed.reduce((total, change) => total + change.removed.length, 0)
  const visibleRepositories = changed.slice(0, 3)
  const sections = visibleRepositories.map((change) => {
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
