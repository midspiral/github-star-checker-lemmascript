import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeRepositoryChange,
  formatChangeDetails,
  formatTable,
  notificationForChanges,
} from '../src/presentation.js'
import type { Stargazer } from '../src/domain.js'

function star(id: string, login: string): Stargazer {
  return { id, login, starredAt: '2026-08-27T12:00:00Z' }
}

test('a first observation is a silent baseline', () => {
  const change = computeRepositoryChange('owner/repo', undefined, [star('U1', 'alice')])

  assert.equal(change.baseline, true)
  assert.deepEqual(change.added, [])
  assert.equal(notificationForChanges([change]), undefined)
  assert.match(formatTable([change]), /owner\/repo\s+1\s+\+0/)
})

test('console and notification display both sides of zero-net churn', () => {
  const change = computeRepositoryChange(
    'owner/repo',
    [star('U1', 'alice')],
    [star('U2', 'bob')],
  )

  assert.equal(formatChangeDetails([change]), 'owner/repo\n  new:  @bob\n  lost: @alice')
  assert.deepEqual(notificationForChanges([change]), {
    title: 'GitHub Stars · +1 / -1',
    message: 'owner/repo: +@bob; -@alice',
  })
})
