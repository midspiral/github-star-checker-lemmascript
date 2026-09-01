# github-star-checker — Verified with LemmaScript

[![LemmaScript verified](https://img.shields.io/github/actions/workflow/status/midspiral/github-star-checker-lemmascript/lemmascript.yml?branch=main&label=LemmaScript%20verified)](https://github.com/midspiral/github-star-checker-lemmascript/actions/workflows/lemmascript.yml)

The checker keeps a complete snapshot of each repository's stargazers and
compares immutable GitHub user IDs between runs. The TypeScript in
`src/domain.ts` is the source of truth; Dafny is its verification sidecar.

## Verified core

`diffStargazers(previous, current)` returns two ordered sequences:

- `added`: current stargazers whose immutable IDs were absent previously.
- `removed`: previous stargazers whose immutable IDs are absent currently.

Its four postconditions establish both directions for both results:

- Soundness/provenance: every returned addition comes from `current`, every
  removal comes from `previous`, and the user's ID is absent from the opposite
  snapshot.
- Completeness: every current user absent from `previous` appears in `added`,
  and every previous user absent from `current` appears in `removed`.

The implementation builds ID sets for linear-time reconciliation. Dafny loop
invariants connect each set to the processed snapshot prefix and carry result
soundness and completeness through the two output loops. `containsId` is a pure
recursive specification function.

Runtime input validation separately ensures that GitHub snapshots have unique
IDs and agree with the repository's stargazer count. API fetching, cache I/O,
formatting, and notifications remain explicitly inside the trusted boundary.

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

The current `domain.dfy` needs no handwritten proof additions and therefore
matches `domain.dfy.gen` exactly.

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
