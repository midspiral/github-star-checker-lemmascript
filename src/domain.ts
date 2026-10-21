//@ backend dafny

/**
 * Identity-aware stargazer accounting — verified core.
 *
 * GitHub logins can change, so `id` is the immutable GitHub node ID and is the
 * only field used to decide whether a stargazer was added or removed. When a
 * token may not list a repository's stargazers, only its aggregate count is
 * observed, and changes are reported without names.
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

/** One observation of a repository: its complete listing, or only its count. */
export type Observation =
  | { kind: 'listed'; stargazers: Stargazer[] }
  | { kind: 'counted'; count: number }

export interface RepositoryChange {
  repo: string
  baseline: boolean
  // Whether `added` and `removed` are known; otherwise only the counts are.
  detailed: boolean
  oldCount: number
  newCount: number
  added: Stargazer[]
  removed: Stargazer[]
}

/** Return whether an immutable user ID occurs in a stargazer sequence. */
export function containsId(stargazers: Stargazer[], id: string): boolean {
  return stargazers.some(stargazer => stargazer.id === id)
}

export function observedCount(observation: Observation): number {
  if (observation.kind === 'listed') return observation.stargazers.length
  return observation.count
}

/** The listing of an observation; empty when there is none. */
export function listing(observation: Observation | undefined): Stargazer[] {
  if (observation === undefined) return []
  if (observation.kind === 'listed') return observation.stargazers
  return []
}

export function isListed(observation: Observation | undefined): boolean {
  if (observation === undefined) return false
  return observation.kind === 'listed'
}

/** A change's net count agrees with its names whenever names are reported. */
export function isConsistent(change: RepositoryChange): boolean {
  return !change.detailed
    || change.newCount - change.oldCount === change.added.length - change.removed.length
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
  //@ contract Given two snapshots whose immutable IDs are each distinct, returns exactly the current users whose IDs were absent previously and the previous users whose IDs are absent currently; every result comes from its corresponding snapshot, and the size change between the snapshots equals the number added minus the number removed.
  //@ requires forall(a: nat, forall(b: nat, a < b && b < previous.length ==> previous[a].id !== previous[b].id))
  //@ requires forall(a: nat, forall(b: nat, a < b && b < current.length ==> current[a].id !== current[b].id))
  //@ ensures forall(j: nat, j < \result.added.length ==> current.includes(\result.added[j]) && !containsId(previous, \result.added[j].id))
  //@ ensures forall(k: nat, k < current.length && !containsId(previous, current[k].id) ==> \result.added.includes(current[k]))
  //@ ensures forall(j: nat, j < \result.removed.length ==> previous.includes(\result.removed[j]) && !containsId(current, \result.removed[j].id))
  //@ ensures forall(k: nat, k < previous.length && !containsId(current, previous[k].id) ==> \result.removed.includes(previous[k]))
  //@ ensures current.length - previous.length === \result.added.length - \result.removed.length

  const previousIds = new Set<string>()
  let p = 0
  while (p < previous.length) {
    //@ type p nat
    //@ invariant p <= previous.length
    //@ invariant forall(k: nat, k < p ==> previousIds.has(previous[k].id))
    //@ invariant forall(id: string, previousIds.has(id) ==> exists(k: nat, k < p && previous[k].id === id))
    //@ invariant previousIds.size === p
    //@ decreases previous.length - p
    previousIds.add(previous[p].id)
    p = p + 1
  }

  const currentIds = new Set<string>()
  let c = 0
  while (c < current.length) {
    //@ type c nat
    //@ invariant c <= current.length
    //@ invariant forall(k: nat, k < c ==> currentIds.has(current[k].id))
    //@ invariant forall(id: string, currentIds.has(id) ==> exists(k: nat, k < c && current[k].id === id))
    //@ invariant currentIds.size === c
    //@ decreases current.length - c
    currentIds.add(current[c].id)
    c = c + 1
  }

  let added: Stargazer[] = []
  //@ ghost let addedIds = new Set<string>()
  let i = 0
  while (i < current.length) {
    //@ type i nat
    //@ invariant i <= current.length
    //@ invariant forall(j: nat, j < added.length ==> current.includes(added[j]) && !containsId(previous, added[j].id))
    //@ invariant forall(k: nat, k < i && !containsId(previous, current[k].id) ==> added.includes(current[k]))
    //@ invariant forall(id: string, addedIds.has(id) ==> exists(k: nat, k < i && current[k].id === id) && !previousIds.has(id))
    //@ invariant forall(k: nat, k < i && !previousIds.has(current[k].id) ==> addedIds.has(current[k].id))
    //@ invariant addedIds.size === added.length
    //@ decreases current.length - i
    if (!previousIds.has(current[i].id)) {
      added = [...added, current[i]]
      //@ ghost addedIds = addedIds.add(current[i].id)
    }
    i = i + 1
  }

  let removed: Stargazer[] = []
  //@ ghost let removedIds = new Set<string>()
  let r = 0
  while (r < previous.length) {
    //@ type r nat
    //@ invariant r <= previous.length
    //@ invariant forall(j: nat, j < removed.length ==> previous.includes(removed[j]) && !containsId(current, removed[j].id))
    //@ invariant forall(k: nat, k < r && !containsId(current, previous[k].id) ==> removed.includes(previous[k]))
    //@ invariant forall(id: string, removedIds.has(id) ==> exists(k: nat, k < r && previous[k].id === id) && !currentIds.has(id))
    //@ invariant forall(k: nat, k < r && !currentIds.has(previous[k].id) ==> removedIds.has(previous[k].id))
    //@ invariant removedIds.size === removed.length
    //@ decreases previous.length - r
    if (!currentIds.has(previous[r].id)) {
      removed = [...removed, previous[r]]
      //@ ghost removedIds = removedIds.add(previous[r].id)
    }
    r = r + 1
  }

  return { added: added, removed: removed }
}

/**
 * Compare a repository's previous observation, if any, with its current one.
 * Names are reported only when both observations are complete listings.
 */
export function computeRepositoryChange(
  repo: string,
  previous: Observation | undefined,
  current: Observation,
): RepositoryChange {
  //@ contract The first observation of a repository is a silent baseline. Afterwards the change carries both counts, and names exactly when both observations list stargazers: then added and removed are the identity diff of the two listings. A change never names anyone without both listings, and whenever it names people the net count change equals the number added minus the number removed.
  //@ requires forall(a: nat, forall(b: nat, a < b && b < listing(previous).length ==> listing(previous)[a].id !== listing(previous)[b].id))
  //@ requires forall(a: nat, forall(b: nat, a < b && b < listing(current).length ==> listing(current)[a].id !== listing(current)[b].id))
  //@ ensures \result.repo === repo
  //@ ensures \result.baseline === (previous === undefined)
  //@ ensures \result.newCount === observedCount(current)
  //@ ensures \result.baseline ==> \result.oldCount === \result.newCount && \result.added.length === 0 && \result.removed.length === 0
  //@ ensures previous !== undefined ==> \result.oldCount === observedCount(previous)
  //@ ensures \result.detailed === (isListed(current) && (previous === undefined || isListed(previous)))
  //@ ensures !\result.detailed ==> \result.added.length === 0 && \result.removed.length === 0
  //@ ensures \result.detailed && !\result.baseline ==> forall(j: nat, j < \result.added.length ==> listing(current).includes(\result.added[j]) && !containsId(listing(previous), \result.added[j].id))
  //@ ensures \result.detailed && !\result.baseline ==> forall(k: nat, k < listing(current).length && !containsId(listing(previous), listing(current)[k].id) ==> \result.added.includes(listing(current)[k]))
  //@ ensures \result.detailed && !\result.baseline ==> forall(j: nat, j < \result.removed.length ==> listing(previous).includes(\result.removed[j]) && !containsId(listing(current), \result.removed[j].id))
  //@ ensures \result.detailed && !\result.baseline ==> forall(k: nat, k < listing(previous).length && !containsId(listing(current), listing(previous)[k].id) ==> \result.removed.includes(listing(previous)[k]))
  //@ ensures isConsistent(\result)

  const newCount = observedCount(current)
  if (previous === undefined) {
    return {
      repo: repo,
      baseline: true,
      detailed: isListed(current),
      oldCount: newCount,
      newCount: newCount,
      added: [],
      removed: [],
    }
  }

  const oldCount = observedCount(previous)
  if (!isListed(previous) || !isListed(current)) {
    return {
      repo: repo,
      baseline: false,
      detailed: false,
      oldCount: oldCount,
      newCount: newCount,
      added: [],
      removed: [],
    }
  }

  const diff = diffStargazers(listing(previous), listing(current))
  return {
    repo: repo,
    baseline: false,
    detailed: true,
    oldCount: oldCount,
    newCount: newCount,
    added: diff.added,
    removed: diff.removed,
  }
}

/**
 * Net count change across repositories: the table's total. It always equals
 * the notification's arrivals minus departures.
 */
export function netTotal(changes: RepositoryChange[]): number {
  //@ contract For consistent changes, the total net count change equals the reported arrivals minus departures.
  //@ requires forall(i: nat, i < changes.length ==> isConsistent(changes[i]))
  //@ ensures \result === addedTotal(changes) - removedTotal(changes)
  //@ decreases changes.length
  if (changes.length === 0) return 0
  return changes[0].newCount - changes[0].oldCount + netTotal(changes.slice(1))
}

/** Arrivals: named additions, or the positive net change of a count-only repository. */
export function addedTotal(changes: RepositoryChange[]): number {
  //@ decreases changes.length
  if (changes.length === 0) return 0
  const first = changes[0].detailed
    ? changes[0].added.length
    : Math.max(changes[0].newCount - changes[0].oldCount, 0)
  return first + addedTotal(changes.slice(1))
}

/** Departures: named removals, or the negative net change of a count-only repository. */
export function removedTotal(changes: RepositoryChange[]): number {
  //@ decreases changes.length
  if (changes.length === 0) return 0
  const first = changes[0].detailed
    ? changes[0].removed.length
    : Math.max(changes[0].oldCount - changes[0].newCount, 0)
  return first + removedTotal(changes.slice(1))
}
