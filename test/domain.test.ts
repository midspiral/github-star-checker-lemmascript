import assert from 'node:assert/strict'
import test from 'node:test'

import { diffStargazers } from '../src/domain.js'
import type { Stargazer } from '../src/domain.js'

function star(id: string, login: string): Stargazer {
  return { id, login, starredAt: '2026-08-27T12:00:00Z' }
}

test('diffStargazers reports additions and removals by immutable ID', () => {
  const previous = [star('U1', 'alice'), star('U2', 'bob')]
  const current = [star('U2', 'bob'), star('U3', 'carol')]

  const result = diffStargazers(previous, current)

  assert.deepEqual(result.added, [current[1]])
  assert.deepEqual(result.removed, [previous[0]])
})

test('a login rename is not an addition or removal', () => {
  const previous = [star('U1', 'old-login')]
  const current = [star('U1', 'new-login')]

  assert.deepEqual(diffStargazers(previous, current), { added: [], removed: [] })
})

test('zero-net churn still reports both identities', () => {
  const result = diffStargazers([star('U1', 'alice')], [star('U2', 'bob')])

  assert.deepEqual(result.added.map(user => user.login), ['bob'])
  assert.deepEqual(result.removed.map(user => user.login), ['alice'])
})
