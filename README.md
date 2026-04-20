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
src/domain.ts    Annotated TS: computeDiff, extractIncreases, sumDiffs
src/domain.dfy   Generated Dafny + proof additions (SumDiffs_append lemma + witness asserts)
```

## Verified properties

- Each diff row correctly computes `newCount - oldCount`
- Total diff equals the sum of individual diffs
- Report contains exactly one row per input repo, in input order
- Counts in each row faithfully mirror the input maps
- `extractIncreases` is sound (every output row has `diff > 0`) and complete (every input row with `diff > 0` appears in the output) — powers the per-repo desktop notification

6 Dafny VCs, 0 errors.
