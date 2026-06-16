//@ backend dafny

/**
 * Star-count diff — verified core.
 */

export interface DiffRow {
  repo: string
  oldCount: number
  newCount: number
  diff: number
}

export interface DiffReport {
  rows: DiffRow[]
  totalDiff: number
}

// ─── Pure recursive helpers ──────────────────────────────────────
// Auto-pure (no while, no mutable let). Emit as Dafny `function`s.

// Total of row diffs. Companion `SumDiffs_append` lemma (domain.dfy) discharges
// the per-iteration step in computeDiff's `total === sumDiffs(rows)` invariant.
export function sumDiffs(rows: DiffRow[]): number {
  //@ decreases rows.length
  if (rows.length === 0) return 0
  return rows[0].diff + sumDiffs(rows.slice(1))
}

// "UpTo" counters — count rows in the prefix rows[0..n] matching a sign.
// The prefix shape matches the loop invariants in the extractors (idx grows
// from 0 to |rows|), so the step is definitional and no bridging lemma is
// needed. The corresponding "whole-sequence" count is `countXUpTo(rows, rows.length)`.
export function countPositiveUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  //@ ensures \result >= 0 && \result <= n
  if (n === 0) return 0
  return countPositiveUpTo(rows, n - 1) + (rows[n - 1].diff > 0 ? 1 : 0)
}

export function countNegativeUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  //@ ensures \result >= 0 && \result <= n
  if (n === 0) return 0
  return countNegativeUpTo(rows, n - 1) + (rows[n - 1].diff < 0 ? 1 : 0)
}

export function countZeroUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  //@ ensures \result >= 0 && \result <= n
  if (n === 0) return 0
  return countZeroUpTo(rows, n - 1) + (rows[n - 1].diff === 0 ? 1 : 0)
}

// UpTo sums over positive / negative diffs. (The zero-sign sum is trivially 0.)
export function sumPositiveUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  if (n === 0) return 0
  return sumPositiveUpTo(rows, n - 1) + (rows[n - 1].diff > 0 ? rows[n - 1].diff : 0)
}

export function sumNegativeUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  if (n === 0) return 0
  return sumNegativeUpTo(rows, n - 1) + (rows[n - 1].diff < 0 ? rows[n - 1].diff : 0)
}

// Unsigned-sum in the upTo form — bridges between the n-indexed partition
// lemmas (over rows[0..n]) and the tail-recursive `sumDiffs` used by computeDiff.
export function sumDiffsUpTo(rows: DiffRow[], n: number): number {
  //@ type n nat
  //@ requires n <= rows.length
  //@ decreases n
  if (n === 0) return 0
  return sumDiffsUpTo(rows, n - 1) + rows[n - 1].diff
}

// ─── Core: compute the diff report ────────────────────────────────
// Postconditions (all proved):
//   - one row per input repo, in input order
//   - each row's fields match the two input maps
//   - each row's diff is newCount - oldCount
//   - totalDiff is the sum of row diffs

export function computeDiff(
  repos: string[],
  oldCounts: Record<string, number>,
  newCounts: Record<string, number>,
): DiffReport {
  //@ contract Builds one diff row per repo in input order — each row's new and old counts come from the maps (old defaulting to 0), its diff is new minus old, and the report's total equals the sum of all row diffs.
  //@ requires forall(i: nat, i < repos.length ==> repos[i] in newCounts)
  //@ ensures \result.rows.length === repos.length
  //@ ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].repo === repos[i])
  //@ ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].newCount === newCounts[repos[i]])
  //@ ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].oldCount === (repos[i] in oldCounts ? oldCounts[repos[i]] : 0))
  //@ ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].diff === \result.rows[i].newCount - \result.rows[i].oldCount)
  //@ ensures \result.totalDiff === sumDiffs(\result.rows)

  let rows: DiffRow[] = []
  let total = 0
  let idx = 0
  while (idx < repos.length) {
    //@ type idx nat
    //@ invariant idx <= repos.length
    //@ invariant rows.length === idx
    //@ invariant forall(i: nat, i < rows.length ==> rows[i].repo === repos[i])
    //@ invariant forall(i: nat, i < rows.length ==> rows[i].newCount === newCounts[repos[i]])
    //@ invariant forall(i: nat, i < rows.length ==> rows[i].oldCount === (repos[i] in oldCounts ? oldCounts[repos[i]] : 0))
    //@ invariant forall(i: nat, i < rows.length ==> rows[i].diff === rows[i].newCount - rows[i].oldCount)
    //@ invariant total === sumDiffs(rows)
    //@ decreases repos.length - idx
    const repo = repos[idx]
    // For newCounts, the `: 0` branch is dead under the requires; writing the ternary
    // lets the k-in-m narrow rule emit direct `newCounts[repo]` in Dafny.
    const newC = repo in newCounts ? newCounts[repo] : 0
    const oldC = repo in oldCounts ? oldCounts[repo] : 0
    const diff = newC - oldC
    const row: DiffRow = { repo: repo, oldCount: oldC, newCount: newC, diff: diff }
    rows = [...rows, row]
    total = total + diff
    idx = idx + 1
  }
  return { rows: rows, totalDiff: total }
}

// ─── Sign-classified extractors ──────────────────────────────────
// Powers the richer notification: "foo/bar +1, baz/qux +3" for gainers,
// with parallel extractors for losers and same rows. Each proves:
//   - soundness (every output row has the expected sign)
//   - completeness (every input row with the expected sign appears)
//   - length bound (no row is invented — |out| ≤ |rows|)

export function extractIncreases(report: DiffReport): DiffRow[] {
  //@ contract Returns exactly the rows that gained stars (diff > 0), in their original order — every output gained (sound), every gainer appears (complete), relative order is preserved, no row is invented, and the count and diff-sum match the positive totals.
  //@ ensures \result.length <= report.rows.length
  //@ ensures \result.length === countPositiveUpTo(report.rows, report.rows.length)
  //@ ensures sumDiffs(\result) === sumPositiveUpTo(report.rows, report.rows.length)
  //@ ensures forall(j: nat, j < \result.length ==> \result[j].diff > 0)
  //@ ensures forall(k: nat, k < report.rows.length && report.rows[k].diff > 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  //@ ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff > 0 && report.rows[k2].diff > 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))

  let out: DiffRow[] = []
  let i = 0
  while (i < report.rows.length) {
    //@ type i nat
    //@ invariant i <= report.rows.length
    //@ invariant out.length <= i
    //@ invariant out.length === countPositiveUpTo(report.rows, i)
    //@ invariant sumDiffs(out) === sumPositiveUpTo(report.rows, i)
    //@ invariant forall(j: nat, j < out.length ==> out[j].diff > 0)
    //@ invariant forall(k: nat, k < i && report.rows[k].diff > 0 ==> exists(j: nat, j < out.length && out[j] === report.rows[k]))
    //@ invariant forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < i && report.rows[k1].diff > 0 && report.rows[k2].diff > 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < out.length && out[j1] === report.rows[k1] && out[j2] === report.rows[k2]))))
    //@ decreases report.rows.length - i
    if (report.rows[i].diff > 0) {
      out = [...out, report.rows[i]]
    }
    i = i + 1
  }
  return out
}

export function extractDecreases(report: DiffReport): DiffRow[] {
  //@ contract Returns exactly the rows that lost stars (diff < 0), in their original order — sound, complete, order-preserving, none invented, and the count and diff-sum match the negative totals.
  //@ ensures \result.length <= report.rows.length
  //@ ensures \result.length === countNegativeUpTo(report.rows, report.rows.length)
  //@ ensures sumDiffs(\result) === sumNegativeUpTo(report.rows, report.rows.length)
  //@ ensures forall(j: nat, j < \result.length ==> \result[j].diff < 0)
  //@ ensures forall(k: nat, k < report.rows.length && report.rows[k].diff < 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  //@ ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff < 0 && report.rows[k2].diff < 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))

  let out: DiffRow[] = []
  let i = 0
  while (i < report.rows.length) {
    //@ type i nat
    //@ invariant i <= report.rows.length
    //@ invariant out.length <= i
    //@ invariant out.length === countNegativeUpTo(report.rows, i)
    //@ invariant sumDiffs(out) === sumNegativeUpTo(report.rows, i)
    //@ invariant forall(j: nat, j < out.length ==> out[j].diff < 0)
    //@ invariant forall(k: nat, k < i && report.rows[k].diff < 0 ==> exists(j: nat, j < out.length && out[j] === report.rows[k]))
    //@ invariant forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < i && report.rows[k1].diff < 0 && report.rows[k2].diff < 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < out.length && out[j1] === report.rows[k1] && out[j2] === report.rows[k2]))))
    //@ decreases report.rows.length - i
    if (report.rows[i].diff < 0) {
      out = [...out, report.rows[i]]
    }
    i = i + 1
  }
  return out
}

// ─── Conservation theorem ────────────────────────────────────────
// Every row in the report falls into exactly one of {gained, lost, same},
// and the non-trivial sums add up to totalDiff. Packaged as a function so the
// ensures clauses are user-visible; the body just invokes the three extractors
// (and the generated .dfy adds CountPartitionUpTo / SumPartitionUpTo /
// SumDiffs_eq_UpTo calls as proof hints).

interface Decomposition {
  increases: DiffRow[]
  decreases: DiffRow[]
  same: DiffRow[]
}

export function decompose(report: DiffReport): Decomposition {
  //@ contract The gained, lost, and unchanged counts sum to the total number of rows, and the gained and lost diffs together sum to the report's total (the unchanged diffs summing to zero).
  //@ requires report.totalDiff === sumDiffs(report.rows)
  //@ ensures \result.increases.length + \result.decreases.length + \result.same.length === report.rows.length
  //@ ensures sumDiffs(\result.increases) + sumDiffs(\result.decreases) === report.totalDiff
  //@ ensures sumDiffs(\result.same) === 0
  const increases = extractIncreases(report)
  const decreases = extractDecreases(report)
  const same = extractUnchanged(report)
  return { increases: increases, decreases: decreases, same: same }
}

export function extractUnchanged(report: DiffReport): DiffRow[] {
  //@ contract Returns exactly the unchanged rows (diff === 0), in their original order — sound, complete, order-preserving, none invented, and their diffs sum to zero.
  //@ ensures \result.length <= report.rows.length
  //@ ensures \result.length === countZeroUpTo(report.rows, report.rows.length)
  //@ ensures sumDiffs(\result) === 0
  //@ ensures forall(j: nat, j < \result.length ==> \result[j].diff === 0)
  //@ ensures forall(k: nat, k < report.rows.length && report.rows[k].diff === 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  //@ ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff === 0 && report.rows[k2].diff === 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))

  let out: DiffRow[] = []
  let i = 0
  while (i < report.rows.length) {
    //@ type i nat
    //@ invariant i <= report.rows.length
    //@ invariant out.length <= i
    //@ invariant out.length === countZeroUpTo(report.rows, i)
    //@ invariant sumDiffs(out) === 0
    //@ invariant forall(j: nat, j < out.length ==> out[j].diff === 0)
    //@ invariant forall(k: nat, k < i && report.rows[k].diff === 0 ==> exists(j: nat, j < out.length && out[j] === report.rows[k]))
    //@ invariant forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < i && report.rows[k1].diff === 0 && report.rows[k2].diff === 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < out.length && out[j1] === report.rows[k1] && out[j2] === report.rows[k2]))))
    //@ decreases report.rows.length - i
    if (report.rows[i].diff === 0) {
      out = [...out, report.rows[i]]
    }
    i = i + 1
  }
  return out
}
