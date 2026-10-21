# GitHub Star Checker

A small CLI that remembers the individual GitHub users starring a set of
repositories and reports who arrived or left since the previous successful
run. Its identity-diff core is formally verified in Dafny via
[LemmaScript](https://github.com/midspiral/LemmaScript).

## Requirements

- Node.js 18 or newer.
- `GITHUB_TOKEN`. GitHub restricts stargazer listings to repository admins
  and collaborators; other repositories are tracked by count only (see below).
- `terminal-notifier` for macOS watch-mode notifications (optional).

## Usage

The command line is unchanged:

```sh
npm run stars -- owner/repo1 owner/repo2 ...
npm run stars -- --watch --every 10 owner/repo1 owner/repo2 ...
```

Pass the complete group of repositories you want to check in one invocation.
The first successful observation of a repository establishes a quiet baseline.
Later runs retain the aggregate table and add the complete identity change list:

```text
repo                               stars     new
────────────────────────────────────────────────
owner/one                            125      +0
owner/two                             42      +1
────────────────────────────────────────────────
total                                167      +1

owner/one
  new:  @alice
  lost: @bob
owner/two
  new:  @carol
```

Zero-net changes are still reported: one new user and one lost user produces
`+0` in the table but both names in the details and notification.

## Count-only repositories

When the token cannot list a repository's stargazers (GitHub answers 404, or
an empty list for a non-empty repository), that repository falls back to its
aggregate `stargazers_count`. It is marked `(count)` in the table and reports
only its net change:

```text
repo                               stars     new
────────────────────────────────────────────────
owner/one                            125      +1
other/repo (count)                    21      +2
────────────────────────────────────────────────
total                                146      +3

owner/one (+1/125)
  new:  @alice
other/repo (+2/21, names unavailable)
```

The choice is made on every run, so a repository switches to names as soon as
the token gains access; that first listing is a baseline for names, while its
count change is still reported. Count-only tracking cannot see zero-net churn.

## Snapshot cache

State is only a versioned `.stargazers-cache.json` file. Each repository stores
its count and, when available, its last complete snapshot keyed by the user's
immutable GitHub node ID:

```json
{
  "version": 2,
  "updatedAt": "2026-08-27T14:30:00.000Z",
  "repositories": {
    "other/repo": {
      "fetchedAt": "2026-08-27T14:30:00.000Z",
      "count": 21
    },
    "owner/repo": {
      "fetchedAt": "2026-08-27T14:30:00.000Z",
      "count": 1,
      "stargazers": {
        "MDQ6VXNlcjE=": {
          "login": "alice",
          "starredAt": "2026-08-25T10:15:00Z"
        }
      }
    }
  }
}
```

Logins are display data, so a username change is not misreported as one lost
and one new user. Repositories not included in a run remain in the cache.
Version 1 caches are migrated on load.

The CLI fetches every paginated stargazer page and checks the result against
GitHub's count before atomically replacing the cache. If the listing is
partial or changes during pagination, the cache is left untouched.
All requested repositories form one update: one failure prevents the batch from
being saved.

Because this is a single-snapshot cache, reports mean “since the previous
successful run.” There is no historical event database.

## Notifications

Watch mode sends notifications such as:

```text
GitHub Stars · +4 / -1
owner/repo: +@alice, +@bob; -@carol · other/repo: +@dana · counted/repo: +1
```

Long notifications show a bounded set of names and summarize the remainder;
the CLI output is never truncated.

## Architecture

```text
src/domain.ts        verified identity diff, count-only fallback, and totals
src/github.ts        paginated GitHub API client and consistency checks
src/cache.ts         JSON validation, merging, and atomic persistence
src/presentation.ts  aggregate table, identity details, notifications
src/cli.ts           arguments, watch loop, orchestration, trusted I/O
```

See [README_LemmaScript.md](README_LemmaScript.md) for the verification story.

## Development

```sh
npm install
npm run typecheck
npm test
npm run check
```
