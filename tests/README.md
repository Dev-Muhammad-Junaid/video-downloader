# Tests

`npm test` runs the unit suites. `scripts/release.sh` runs them plus a
typecheck and **refuses to publish** if either fails.

## Why these exist

Every suite in `tests/unit` traces to a defect that reached a real build. The
guiding rule: **when a bug is fixed, add the test that would have caught it** —
ideally asserting the behaviour at the seam where the damage happened, not the
helper underneath it.

Several of these defects shipped repeatedly. Writing user data inside the
`.app` bundle happened five separate times, in five different places, because
nothing checked. That is the case for the guardrail tests below.

| Suite | Guards against |
|---|---|
| `data-safety` | The library permanently deleting entries whose files it can't reach. Cost ~462 MB of media. |
| `no-bundle-writes` | Anything writable built from `process.cwd()` — inside the app bundle, deleted by every update. |
| `paths-contract` | Where media, DB, transcripts and thumbnails live; the DB export reading a path that never held data; the media route refusing files that exist. |
| `job-lifecycle` | Exports bypassing the concurrency limiter (~950% CPU); downloads vanishing with no error; CPU-pinning encoder presets returning. |
| `playlist-scope` | A video link with `?list=` downloading a 552-entry Radio mix instead of the video. |
| `transcription-limits` | Long recordings failing with a bare `413`; chunk offsets not reconstructing a continuous timeline. |
| `update-signature` | An update installing without a valid signature from our key. The only thing standing between a tampered release and code execution. |
| `settings-secrets` | API keys falling back to plaintext; env-provided secrets being written to disk. |
| `encoder` | Hardware encoding silently reverting to software; tiers going out of order. |
| `markdown` | Release notes rendering as raw markup, or a release body injecting HTML into the app. |
| `format`, `time`, `subtitles`, `profiles`, `ytdlp-errors`, `library-safety` | Pure logic: formatting, timestamp parsing, SRT/ASS handling, profile resolution, error messages, bundle-path detection. |

## Adding to this

When you fix a bug worth not repeating:

1. **Assert at the seam.** `data-safety` calls the library route with a mocked
   filesystem, rather than testing a path helper — the route is where rows were
   being deleted.
2. **Prove the test fails without the fix.** Reintroduce the bug, watch it go
   red, put the fix back. A regression test never seen failing may be asserting
   nothing. Both `data-safety` and `no-bundle-writes` were checked this way.
3. **Say what happened in the comment**, with the number if there is one — "552
   entries", "~477% CPU", "462 MB". A future reader needs to know the stakes to
   judge whether a change is safe.
4. **Guard the class, not just the instance,** where a mistake is repeatable.
   `no-bundle-writes` walks the whole source tree instead of checking the four
   places that had already gone wrong.

Feature-level checks that need a real server, real binaries and real files live
in `tests/smoke.mjs`, run with `npm run test:smoke`.
