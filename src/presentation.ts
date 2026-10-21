import { addedTotal, netTotal, removedTotal } from './domain.js'
import type { RepositoryChange, Stargazer } from './domain.js'

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
  for (const change of changes) {
    lines.push(
      tableLabel(change).padEnd(repoWidth)
      + change.newCount.toLocaleString().padStart(10)
      + signed(netChange(change)).padStart(8),
    )
    totalStars += change.newCount
  }

  lines.push(separator)
  lines.push(
    'total'.padEnd(repoWidth)
    + totalStars.toLocaleString().padStart(10)
    + signed(netTotal(changes)).padStart(8),
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
    // Verified: these net to the table's total (`netTotal`).
    title: `GitHub Stars · +${addedTotal(changes)} / -${removedTotal(changes)}`,
    message: sections.join(' · '),
  }
}
