import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchRepositorySnapshot } from '../src/github.js'

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function githubStar(id: string, login: string): unknown {
  return {
    starred_at: '2026-08-27T12:00:00Z',
    user: { node_id: id, login },
  }
}

test('fetchRepositorySnapshot follows pagination and validates the count', async () => {
  const queue = [
    jsonResponse({ stargazers_count: 2 }),
    jsonResponse([githubStar('U2', 'bob')], {
      link: '<https://api.github.com/repos/owner/repo/stargazers?per_page=100&page=2>; rel="next"',
    }),
    jsonResponse([githubStar('U1', 'alice')]),
    jsonResponse({ stargazers_count: 2 }),
  ]
  const requests: Array<{ url: string; accept: string | null }> = []

  const snapshot = await fetchRepositorySnapshot('owner/repo', {
    token: 'test-token',
    now: () => new Date('2026-08-27T14:00:00Z'),
    fetchImplementation: async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString()
      const requestHeaders = new Headers(init?.headers)
      requests.push({ url, accept: requestHeaders.get('accept') })
      const response = queue.shift()
      if (response === undefined) throw new Error('Unexpected request')
      return response
    },
  })

  assert.equal(queue.length, 0)
  assert.equal(requests.length, 4)
  assert.equal(requests[0].url, 'https://api.github.com/repos/owner/repo')
  assert.equal(requests[3].url, 'https://api.github.com/repos/owner/repo')
  assert.equal(requests[1].accept, 'application/vnd.github.star+json')
  assert.equal(snapshot.fetchedAt, '2026-08-27T14:00:00.000Z')
  assert.equal(snapshot.count, 2)
  assert.deepEqual(snapshot.stargazers?.map(user => user.login), ['alice', 'bob'])
})

async function snapshotFrom(queue: Response[]) {
  const snapshot = await fetchRepositorySnapshot('owner/repo', {
    token: 'test-token',
    fetchImplementation: async () => {
      const response = queue.shift()
      if (response === undefined) throw new Error('Unexpected request')
      return response
    },
  })
  assert.equal(queue.length, 0)
  return snapshot
}

test('a restricted listing falls back to the aggregate count', async () => {
  const snapshot = await snapshotFrom([
    jsonResponse({ stargazers_count: 21 }),
    new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
  ])

  assert.equal(snapshot.count, 21)
  assert.equal(snapshot.stargazers, undefined)
})

test('an empty listing is never interpreted as everybody leaving', async () => {
  const snapshot = await snapshotFrom([
    jsonResponse({ stargazers_count: 2 }),
    jsonResponse([]),
  ])

  assert.equal(snapshot.count, 2)
  assert.equal(snapshot.stargazers, undefined)
})

test('a missing later page is an error, not a restricted listing', async () => {
  await assert.rejects(
    snapshotFrom([
      jsonResponse({ stargazers_count: 2 }),
      jsonResponse([githubStar('U1', 'alice')], {
        link: '<https://api.github.com/repos/owner/repo/stargazers?per_page=100&page=2>; rel="next"',
      }),
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    ]),
    /404 Not Found/,
  )
})
