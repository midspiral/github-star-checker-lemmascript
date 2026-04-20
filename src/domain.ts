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

// Auto-pure recursive helper. Emits as a Dafny `function`.
// The companion `SumDiffs_append` lemma (added in domain.dfy) discharges the
// per-iteration step in computeDiff's `total === sumDiffs(rows)` invariant.
export function sumDiffs(rows: DiffRow[]): number {
  //@ decreases rows.length
  if (rows.length === 0) return 0
  return rows[0].diff + sumDiffs(rows.slice(1))
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
    //@ assert repo in newCounts
    const newC = newCounts[repo]
    const oldC = repo in oldCounts ? oldCounts[repo] : 0
    const diff = newC - oldC
    const row: DiffRow = { repo: repo, oldCount: oldC, newCount: newC, diff: diff }
    rows = [...rows, row]
    total = total + diff
    idx = idx + 1
  }
  return { rows: rows, totalDiff: total }
}

// ─── Enhancement: extract repos with a positive delta ─────────────
// Powers the richer notification: "foo/bar +1, baz/qux +3" instead of
// just "+4 new stars". Soundness: every output row has diff > 0.
// Completeness: every input row with diff > 0 appears in the output.

export function extractIncreases(report: DiffReport): DiffRow[] {
  //@ ensures \result.length <= report.rows.length
  //@ ensures forall(j: nat, j < \result.length ==> \result[j].diff > 0)
  //@ ensures forall(k: nat, k < report.rows.length && report.rows[k].diff > 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))

  let out: DiffRow[] = []
  let i = 0
  while (i < report.rows.length) {
    //@ type i nat
    //@ invariant i <= report.rows.length
    //@ invariant out.length <= i
    //@ invariant forall(j: nat, j < out.length ==> out[j].diff > 0)
    //@ invariant forall(k: nat, k < i && report.rows[k].diff > 0 ==> exists(j: nat, j < out.length && out[j] === report.rows[k]))
    //@ decreases report.rows.length - i
    if (report.rows[i].diff > 0) {
      out = [...out, report.rows[i]]
    }
    i = i + 1
  }
  return out
}
