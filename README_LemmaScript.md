# github-star-checker — Verified with LemmaScript

A CLI that polls GitHub star counts and reports per-run deltas, with the
diff arithmetic verified in Dafny via [LemmaScript](https://github.com/midspiral/LemmaScript).
The TypeScript in `src/domain.ts` is the source of truth; the `.dfy` files
are a verification side-car.

## The verified core

Three pieces live in `src/domain.ts`:

- `sumDiffs(rows)` — recursive sum over `DiffRow[]`. Auto-pure; emits as a
  Dafny `function`.
- `computeDiff(repos, oldCounts, newCounts)` — builds the per-repo diff
  report; the `totalDiff` field equals `sumDiffs(rows)` by loop
  invariant. One `//@ assert repo in newCounts` in the body bridges from
  the universal requires (`forall i :: repos[i] in newCounts`) to the
  concrete atom the per-access narrowing consumes.
- `extractIncreases(report)` — filters rows with `diff > 0` into their own
  list. Powers the per-repo desktop notification.

## What's verified

- **Row correctness:** each `DiffRow` has `diff = newCount - oldCount`.
- **Row correspondence:** rows line up with input repos by index.
- **Count faithfulness:** each row reports the value from the API map
  (`newCount === newCounts[repos[i]]`, `oldCount === (repos[i] in oldCounts ? oldCounts[repos[i]] : 0)`).
- **Total conservation:** `totalDiff = sumDiffs(rows)` — the one non-trivial
  lemma (`SumDiffs_append`, inductive on sequence append).
- **`extractIncreases` soundness:** every row in the output has `diff > 0`.
- **`extractIncreases` completeness:** every input row with `diff > 0`
  appears in the output.
- **Length bound:** `|extractIncreases(report)| ≤ |report.rows|`.

**6 Dafny verification conditions, 0 errors.**

## File structure

```
src/
  domain.ts         — annotated TS: sumDiffs, computeDiff, extractIncreases
  domain.dfy.gen    — generated from domain.ts by `lsc gen --backend=dafny`
  domain.dfy        — copy of .dfy.gen + additions-only proof hints
  cli.ts            — trusted boundary (fetch, state, output, notification)
bin/
  stars             — shell entry: `stars owner/repo [...]`
```

## Setup

**Prerequisites:** Node.js ≥ 18, [Dafny](https://github.com/dafny-lang/dafny) ≥ 4.x.
Assumes `LemmaScript` is cloned as a sibling directory (`../LemmaScript`).

```sh
cd ../LemmaScript/tools && npm install
cd -                     && npm install
```

## Usage

```sh
npm run stars -- owner/repo1 owner/repo2 ...
npm run stars -- --watch --every 10 owner/repo1 ...   # with per-repo notifications
```

## Verification

```sh
npm run check          # lsc check --backend=dafny src/domain.ts
npm run gen            # regen domain.dfy.gen
npm run regen          # three-way merge .dfy with new .dfy.gen
```

## Proof additions (in `src/domain.dfy`)

Two hand-written additions on top of the generated `.dfy.gen`:

1. **`SumDiffs_append` lemma** — `sumDiffs(rows + [row]) == sumDiffs(rows) + row.diff`,
   proved by induction on `|rows|`. Called inside `computeDiff`'s loop
   body immediately before the append, to discharge the
   `total == sumDiffs(rows)` invariant step.
2. **`extractIncreases` witness hints** — a `ghost out_old := out`
   snapshot plus two asserts (new-row witness in the if-true branch;
   prefix-preservation across the append) so Dafny can re-establish
   the completeness invariant `forall k, rows[k].diff > 0 ==> exists j,
   out[j] == rows[k]`.

Nothing else is user-written in `.dfy` — the rest is produced by
LemmaScript from `domain.ts`.
