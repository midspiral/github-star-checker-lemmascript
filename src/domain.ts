//@ backend dafny

/**
 * Identity-aware stargazer diff — verified core.
 *
 * GitHub logins can change, so `id` is the immutable GitHub node ID and is the
 * only field used to decide whether a stargazer was added or removed.
 */

export interface Stargazer {
  id: string
  login: string
  starredAt: string
}

export interface StargazerDiff {
  added: Stargazer[]
  removed: Stargazer[]
}

/** Return whether an immutable user ID occurs in a stargazer sequence. */
export function containsId(stargazers: Stargazer[], id: string): boolean {
  //@ decreases stargazers.length
  if (stargazers.length === 0) return false
  return stargazers[0].id === id || containsId(stargazers.slice(1), id)
}

/**
 * Reconcile two complete snapshots.
 *
 * Results preserve API/cache order: additions follow `current`, removals
 * follow `previous`. Display code may choose a friendlier presentation order.
 */
export function diffStargazers(
  previous: Stargazer[],
  current: Stargazer[],
): StargazerDiff {
  //@ contract Returns exactly the current users whose immutable IDs were absent previously and the previous users whose immutable IDs are absent currently; every result comes from its corresponding snapshot.
  //@ ensures forall(j: nat, j < \result.added.length ==> exists(k: nat, k < current.length && \result.added[j] === current[k] && !containsId(previous, \result.added[j].id)))
  //@ ensures forall(k: nat, k < current.length && !containsId(previous, current[k].id) ==> exists(j: nat, j < \result.added.length && \result.added[j] === current[k]))
  //@ ensures forall(j: nat, j < \result.removed.length ==> exists(k: nat, k < previous.length && \result.removed[j] === previous[k] && !containsId(current, \result.removed[j].id)))
  //@ ensures forall(k: nat, k < previous.length && !containsId(current, previous[k].id) ==> exists(j: nat, j < \result.removed.length && \result.removed[j] === previous[k]))

  const previousIds = new Set<string>()
  let p = 0
  while (p < previous.length) {
    //@ invariant p <= previous.length
    //@ invariant forall(k: nat, k < p ==> previousIds.has(previous[k].id))
    //@ invariant forall(id: string, previousIds.has(id) ==> exists(k: nat, k < p && previous[k].id === id))
    //@ decreases previous.length - p
    previousIds.add(previous[p].id)
    p = p + 1
  }

  const currentIds = new Set<string>()
  let c = 0
  while (c < current.length) {
    //@ invariant c <= current.length
    //@ invariant forall(k: nat, k < c ==> currentIds.has(current[k].id))
    //@ invariant forall(id: string, currentIds.has(id) ==> exists(k: nat, k < c && current[k].id === id))
    //@ decreases current.length - c
    currentIds.add(current[c].id)
    c = c + 1
  }

  let added: Stargazer[] = []
  let i = 0
  while (i < current.length) {
    //@ invariant i <= current.length
    //@ invariant added.length <= i
    //@ invariant forall(j: nat, j < added.length ==> exists(k: nat, k < i && added[j] === current[k] && !containsId(previous, added[j].id)))
    //@ invariant forall(k: nat, k < i && !containsId(previous, current[k].id) ==> exists(j: nat, j < added.length && added[j] === current[k]))
    //@ decreases current.length - i
    if (!previousIds.has(current[i].id)) {
      added = [...added, current[i]]
    }
    i = i + 1
  }

  let removed: Stargazer[] = []
  let r = 0
  while (r < previous.length) {
    //@ invariant r <= previous.length
    //@ invariant removed.length <= r
    //@ invariant forall(j: nat, j < removed.length ==> exists(k: nat, k < r && removed[j] === previous[k] && !containsId(current, removed[j].id)))
    //@ invariant forall(k: nat, k < r && !containsId(current, previous[k].id) ==> exists(j: nat, j < removed.length && removed[j] === previous[k]))
    //@ decreases previous.length - r
    if (!currentIds.has(previous[r].id)) {
      removed = [...removed, previous[r]]
    }
    r = r + 1
  }

  return { added: added, removed: removed }
}
