import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  emptyCache,
  loadCache,
  mergeSnapshots,
  saveCache,
  snapshotToStargazers,
} from '../src/cache.js'

test('mergeSnapshots preserves repositories that were not queried', () => {
  const first = mergeSnapshots(emptyCache(), [{
    repo: 'owner/one',
    fetchedAt: '2026-08-27T12:00:00Z',
    stargazers: [{ id: 'U1', login: 'alice', starredAt: '2026-08-26T12:00:00Z' }],
  }], '2026-08-27T12:00:00Z')

  const second = mergeSnapshots(first, [{
    repo: 'owner/two',
    fetchedAt: '2026-08-27T13:00:00Z',
    stargazers: [{ id: 'U2', login: 'bob', starredAt: '2026-08-27T10:00:00Z' }],
  }], '2026-08-27T13:00:00Z')

  assert.deepEqual(Object.keys(second.repositories), ['owner/one', 'owner/two'])
  assert.deepEqual(snapshotToStargazers(second.repositories['owner/one']).map(user => user.login), ['alice'])
})

test('saveCache atomically writes a loadable versioned cache', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stargazers-cache-test-'))
  const cacheFile = path.join(directory, '.stargazers-cache.json')
  try {
    const cache = mergeSnapshots(emptyCache(), [{
      repo: 'owner/repo',
      fetchedAt: '2026-08-27T12:00:00Z',
      stargazers: [{ id: 'U1', login: 'alice', starredAt: '2026-08-26T12:00:00Z' }],
    }], '2026-08-27T12:00:00Z')

    saveCache(cacheFile, cache)

    assert.deepEqual(loadCache(cacheFile), cache)
    assert.equal(fs.statSync(cacheFile).mode & 0o777, 0o600)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
