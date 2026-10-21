import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeRepositoryChange,
  formatChangeDetails,
  formatTable,
  notificationForChanges,
} from '../src/presentation.js'
import type { Observation } from '../src/presentation.js'
import type { Stargazer } from '../src/domain.js'

function star(id: string, login: string): Stargazer {
  return { id, login, starredAt: '2026-08-27T12:00:00Z' }
}

function listed(...stargazers: Stargazer[]): Observation {
  return { count: stargazers.length, stargazers }
}

function counted(count: number): Observation {
  return { count, stargazers: undefined }
}

test('a first observation is a silent baseline', () => {
  const change = computeRepositoryChange('owner/repo', undefined, listed(star('U1', 'alice')))

  assert.equal(change.baseline, true)
  assert.deepEqual(change.added, [])
  assert.equal(notificationForChanges([change]), undefined)
  assert.match(formatTable([change]), /owner\/repo\s+1\s+\+0/)
})

test('console and notification display both sides of zero-net churn', () => {
  const change = computeRepositoryChange(
    'owner/repo',
    listed(star('U1', 'alice')),
    listed(star('U2', 'bob')),
  )

  assert.equal(formatChangeDetails([change]), 'owner/repo (+1 -1/1)\n  new:  @bob\n  lost: @alice')
  assert.deepEqual(notificationForChanges([change]), {
    title: 'GitHub Stars · +1 / -1',
    message: 'owner/repo: +@bob; -@alice',
  })
})

test('count-only repositories report their net change without names', () => {
  const changes = [
    computeRepositoryChange('owner/listed', listed(star('U1', 'alice')), listed(star('U1', 'alice'), star('U2', 'bob'))),
    computeRepositoryChange('other/counted', counted(19), counted(21)),
  ]

  assert.equal(changes[1].detailed, false)
  assert.match(formatTable(changes), /other\/counted \(count\)\s+21\s+\+2/)
  assert.match(formatTable(changes), /total\s+23\s+\+3/)
  assert.equal(
    formatChangeDetails(changes),
    'owner/listed (+1/2)\n  new:  @bob\nother/counted (+2/21, names unavailable)',
  )
  assert.deepEqual(notificationForChanges(changes), {
    title: 'GitHub Stars · +3 / -0',
    message: 'owner/listed: +@bob · other/counted: +2',
  })
})

test('losing listing access falls back to counts for that run', () => {
  const change = computeRepositoryChange('owner/repo', listed(star('U1', 'alice')), counted(3))

  assert.equal(change.detailed, false)
  assert.equal(formatChangeDetails([change]), 'owner/repo (+2/3, names unavailable)')
})
