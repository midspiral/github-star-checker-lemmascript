# GitHub Star Checker

A CLI tool that tracks GitHub star counts across repos and computes diffs between runs. Core diff logic is formally verified in Dafny via [LemmaScript](https://github.com/midspiral/LemmaScript). See [README_LemmaScript.md](README_LemmaScript.md) for the verification story.

## Usage

```
npm run stars -- owner/repo1 owner/repo2 ...
```

Set `GITHUB_TOKEN` for higher rate limits (optional).

## Example

```
$ npm run stars -- dafny-lang/dafny Z3Prover/z3

repo                               stars     new
────────────────────────────────────────────────
dafny-lang/dafny                   3,375      +0
Z3Prover/z3                       12,005      +0
────────────────────────────────────────────────
total                             15,380      +0

State saved to .stars-state.json
```

Use `--watch [--every N]` for repeated polling with a macOS desktop notification listing which repos gained stars.

## Architecture

```
src/cli.ts       Trusted boundary (GitHub API, state persistence, output, notifications)
src/domain.ts    Annotated TS: computeDiff, extractIncreases / extractDecreases /
                 extractUnchanged, decompose (conservation theorem), pure helpers
src/domain.dfy   Generated Dafny + proof additions (SumDiffs_append, partition
                 lemmas, sumDiffs↔sumDiffsUpTo bridge, witness hints)
```

## Verified properties

Diff report shape:
- Each `DiffRow` has `diff === newCount - oldCount`.
- Rows line up with the input repos by index.
- Each row's counts match the input maps (`newCount === newCounts[repos[i]]`, `oldCount === (repos[i] in oldCounts ? oldCounts[repos[i]] : 0)`).
- `report.totalDiff === sumDiffs(rows)` — total equals the per-row sum, via `SumDiffs_append`.

Sign-classified extractors (`extractIncreases`, `extractDecreases`, `extractUnchanged`):
- **Length bound:** `|\result| <= |report.rows|` — nothing is invented.
- **Count equality:** `|\result| === countPositiveUpTo(report.rows, |rows|)` (analogous for the other two).
- **Sum equality:** `sumDiffs(\result) === sumPositiveUpTo(report.rows, |rows|)` for ±; `sumDiffs(unchanged) === 0` by soundness.
- **Soundness:** every output row has the expected sign.
- **Completeness:** every input row with the expected sign appears in the output.
- **Ordered completeness:** pairs of same-sign input rows keep their relative order in the output — notifications never scramble repo order.

Conservation / partition (`decompose`):
- `|increases| + |decreases| + |unchanged| === |report.rows|` — every row is in exactly one class.
- `sumDiffs(increases) + sumDiffs(decreases) === report.totalDiff` — the non-trivial sums account for the whole delta.
- `sumDiffs(unchanged) === 0`.

**33 Dafny verification conditions, 0 errors.**
