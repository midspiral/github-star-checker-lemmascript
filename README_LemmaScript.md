# github-star-checker — Verified with LemmaScript

[![LemmaScript verified](https://img.shields.io/github/actions/workflow/status/midspiral/github-star-checker-lemmascript/lemmascript.yml?branch=main&label=LemmaScript%20verified)](https://github.com/midspiral/github-star-checker-lemmascript/actions/workflows/lemmascript.yml)

The checker keeps a complete snapshot of each repository's stargazers and
compares immutable GitHub user IDs between runs. The TypeScript in
`src/domain.ts` is the source of truth; Dafny is its verification sidecar.

## Verified core

`diffStargazers(previous, current)` returns two ordered sequences:

- `added`: current stargazers whose immutable IDs were absent previously.
- `removed`: previous stargazers whose immutable IDs are absent currently.

Given snapshots whose IDs are each distinct, its postconditions establish:

- Soundness/provenance: every returned addition comes from `current`, every
  removal comes from `previous`, and the user's ID is absent from the opposite
  snapshot.
- Completeness: every current user absent from `previous` appears in `added`,
  and every previous user absent from `current` appears in `removed`.
- Accounting: `current.length - previous.length` equals
  `added.length - removed.length`, so the table's count change always agrees
  with the names listed.

`computeRepositoryChange(repo, previous, current)` compares observations that
are either a complete listing or, when GitHub will not list stargazers to the
token, only a count. It proves that:

- a first observation is a silent baseline;
- a change carries names exactly when both observations are listings, and then
  they are the identity diff above;
- a count-only change never names anyone;
- whenever names are reported, the net count change equals added minus removed.

`netTotal(changes)`, the table's total, provably equals
`addedTotal(changes) - removedTotal(changes)`, the arrivals and departures in a
notification's title. Count-only repositories contribute their net change to
one side.

The implementation builds ID sets for linear-time reconciliation. Dafny loop
invariants connect each set to the processed snapshot prefix, track ghost sets
of added and removed IDs, and carry soundness, completeness, and set sizes
through the loops. One handwritten lemma, `IdAccounting`, turns those set sizes
into the accounting identity.

The distinct-ID precondition is established at the trusted boundary: the
GitHub client deduplicates by node ID and rejects listings whose unique size
differs from the reported count, and cached listings are keyed by ID. API
fetching, cache I/O, formatting, and notifications remain explicitly inside the
trusted boundary.

## Files

```text
src/domain.ts       annotated TypeScript source
src/domain.dfy.gen  generated Dafny
src/domain.dfy      checked Dafny sidecar
src/github.ts       trusted GitHub API boundary
src/cache.ts        trusted JSON persistence boundary
src/presentation.ts trusted display boundary
src/cli.ts          trusted orchestration boundary
```

`domain.dfy` differs from `domain.dfy.gen` only by the `IdAccounting` lemma
and its call at the end of `diffStargazers`.

## Verification

Prerequisites are Node.js 18 or newer, Dafny 4.x, and a sibling checkout of
LemmaScript at `../LemmaScript`.

```sh
npm run check   # generate, compare the sidecar, and run dafny verify
npm run gen     # regenerate domain.dfy.gen only
npm run regen   # merge generator changes into domain.dfy
```

Runtime coverage complements the proof:

```sh
npm run typecheck
npm test
```
