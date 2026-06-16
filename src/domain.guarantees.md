# Guarantees: src/domain.ts

Generated: 2026-06-16

> Verification is **assumed** (run `lsc check` to discharge the proofs). This report vets only that each `//@ contract` faithfully describes its formal `requires`/`ensures`, via claimcheck's blind round-trip.

## Coverage

- **5** backed contracts: 5 confirmed, 0 disputed
- **0** gaps (contract with no formal spec behind it)

## Claimcheck Results

| Function | Contract | Status |
|----------|----------|--------|
| `computeDiff` | Builds one diff row per repo in input order — each row's new and old counts come from the maps (old defaulting to 0), its diff is new minus old, and the report's total equals the sum of all row diffs. | ✅ confirmed |
| `extractIncreases` | Returns exactly the rows that gained stars (diff > 0), in their original order — every output gained (sound), every gainer appears (complete), relative order is preserved, no row is invented, and the count and diff-sum match the positive totals. | ✅ confirmed |
| `extractDecreases` | Returns exactly the rows that lost stars (diff < 0), in their original order — sound, complete, order-preserving, none invented, and the count and diff-sum match the negative totals. | ✅ confirmed |
| `decompose` | The gained, lost, and unchanged counts sum to the total number of rows, and the gained and lost diffs together sum to the report's total (the unchanged diffs summing to zero). | ✅ confirmed |
| `extractUnchanged` | Returns exactly the unchanged rows (diff === 0), in their original order — sound, complete, order-preserving, none invented, and their diffs sum to zero. | ✅ confirmed |

## Confirmed Guarantees

**Builds one diff row per repo in input order — each row's new and old counts come from the maps (old defaulting to 0), its diff is new minus old, and the report's total equals the sum of all row diffs.** — `computeDiff`
```
computeDiff(repos: string[], oldCounts: Record<string, number>, newCounts: Record<string, number>): DiffReport
  requires forall(i: nat, i < repos.length ==> repos[i] in newCounts)
  ensures \result.rows.length === repos.length
  ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].repo === repos[i])
  ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].newCount === newCounts[repos[i]])
  ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].oldCount === (repos[i] in oldCounts ? oldCounts[repos[i]] : 0))
  ensures forall(i: nat, i < \result.rows.length ==> \result.rows[i].diff === \result.rows[i].newCount - \result.rows[i].oldCount)
  ensures \result.totalDiff === sumDiffs(\result.rows)
```
- Back-translation: Given an array of repository names, a record of old counts, and a record of new counts, computeDiff returns a DiffReport where each row corresponds to a repository in the input array, with the row's repo field set to the repository name, the newCount field set to the value from newCounts for that repository, the oldCount field set to the value from oldCounts for that repository (or 0 if not present), the diff field set to the difference between newCount and oldCount, and the totalDiff field set to the sum of all individual diffs.

**Returns exactly the rows that gained stars (diff > 0), in their original order — every output gained (sound), every gainer appears (complete), relative order is preserved, no row is invented, and the count and diff-sum match the positive totals.** — `extractIncreases`
```
extractIncreases(report: DiffReport): DiffRow[]
  ensures \result.length <= report.rows.length
  ensures \result.length === countPositiveUpTo(report.rows, report.rows.length)
  ensures sumDiffs(\result) === sumPositiveUpTo(report.rows, report.rows.length)
  ensures forall(j: nat, j < \result.length ==> \result[j].diff > 0)
  ensures forall(k: nat, k < report.rows.length && report.rows[k].diff > 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff > 0 && report.rows[k2].diff > 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))
```
- Back-translation: Given a DiffReport, extractIncreases returns an array containing exactly those rows from the report where the diff is positive, preserving their relative order from the original report, with the sum of diffs in the result equal to the sum of all positive diffs in the report.

**Returns exactly the rows that lost stars (diff < 0), in their original order — sound, complete, order-preserving, none invented, and the count and diff-sum match the negative totals.** — `extractDecreases`
```
extractDecreases(report: DiffReport): DiffRow[]
  ensures \result.length <= report.rows.length
  ensures \result.length === countNegativeUpTo(report.rows, report.rows.length)
  ensures sumDiffs(\result) === sumNegativeUpTo(report.rows, report.rows.length)
  ensures forall(j: nat, j < \result.length ==> \result[j].diff < 0)
  ensures forall(k: nat, k < report.rows.length && report.rows[k].diff < 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff < 0 && report.rows[k2].diff < 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))
```
- Back-translation: Given a DiffReport, extractDecreases returns an array containing exactly those rows from the report where the diff is negative, preserving their relative order from the original report, with the sum of diffs in the result equal to the sum of all negative diffs in the report.

**The gained, lost, and unchanged counts sum to the total number of rows, and the gained and lost diffs together sum to the report's total (the unchanged diffs summing to zero).** — `decompose`
```
decompose(report: DiffReport): Decomposition
  requires report.totalDiff === sumDiffs(report.rows)
  ensures \result.increases.length + \result.decreases.length + \result.same.length === report.rows.length
  ensures sumDiffs(\result.increases) + sumDiffs(\result.decreases) === report.totalDiff
  ensures sumDiffs(\result.same) === 0
```
- Back-translation: Given a DiffReport whose totalDiff equals the sum of its rows' diffs, decompose returns a Decomposition where the increases, decreases, and same arrays partition the report's rows, the sum of diffs in increases and decreases equals the report's totalDiff, and the sum of diffs in the same array equals zero.

**Returns exactly the unchanged rows (diff === 0), in their original order — sound, complete, order-preserving, none invented, and their diffs sum to zero.** — `extractUnchanged`
```
extractUnchanged(report: DiffReport): DiffRow[]
  ensures \result.length <= report.rows.length
  ensures \result.length === countZeroUpTo(report.rows, report.rows.length)
  ensures sumDiffs(\result) === 0
  ensures forall(j: nat, j < \result.length ==> \result[j].diff === 0)
  ensures forall(k: nat, k < report.rows.length && report.rows[k].diff === 0 ==> exists(j: nat, j < \result.length && \result[j] === report.rows[k]))
  ensures forall(k1: nat, forall(k2: nat, k1 < k2 && k2 < report.rows.length && report.rows[k1].diff === 0 && report.rows[k2].diff === 0 ==> exists(j1: nat, exists(j2: nat, j1 < j2 && j2 < \result.length && \result[j1] === report.rows[k1] && \result[j2] === report.rows[k2]))))
```
- Back-translation: Given a DiffReport, extractUnchanged returns an array containing exactly those rows from the report where the diff is zero, preserving their relative order from the original report, with the sum of diffs in the result equal to zero.

