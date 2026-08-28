# Argus Testing Strategy

## Test matrix

| Area | Test type | Tool | File |
| --- | --- | --- | --- |
| HMAC verification | Security | Vitest + Supertest | tests/api/webhook.test.ts |
| Webhook accept/reject/ignore | API | Supertest | tests/api/webhook.test.ts |
| Health endpoint | API | Supertest | tests/api/health.test.ts |
| Startup config guard | Unit | Vitest | tests/unit/app-config.test.ts |
| GitHub API boundary | Integration boundary | Nock | tests/unit/github.test.ts |
| Anthropic API boundary | Integration boundary | Nock | tests/unit/llm.test.ts |
| Async enqueue behaviour | Architectural | Supertest + Nock | tests/api/async-behaviour.test.ts |
| Schema and persistence | Integration | Testcontainers | tests/integration/db.test.ts |
| Queue, worker, end to end | Integration | Testcontainers + Nock | tests/integration/workflow.test.ts |
| Regression | Full suite | GitHub Actions | .github/workflows/test.yml |

Totals: 8 test files, 40 tests, 100% coverage on all four metrics.

## Test pyramid

TODO — write this yourself. Cover: why most tests are fast unit and API tests
(19 of 40 run in under 100ms with no Docker), why only 11 are container-backed
integration tests, and why the fast tests are split into `npm test` so the
feedback loop while coding stays around one second. Mention that an inverted
pyramid produces a suite nobody runs.

## Mocking strategy

Services we do not own (GitHub, Anthropic) are mocked with Nock. Their failure
modes cannot be triggered on demand, their responses are not deterministic, and
calling them would make the suite slow, costly, and dependent on network access.

Services we own (PostgreSQL, Redis) run for real via Testcontainers. A fake
database does not enforce NOT NULL constraints, does not have real transactions,
and cannot fail the way a real one does.

`nock.disableNetConnect()` is active for the whole suite with an allowance for
everything except `api.github.com` and `api.anthropic.com`, so an unmocked call
to either external API fails loudly instead of silently reaching the network.

## Known limitations

1. The webhook handler awaits the enqueue before responding, so webhook latency
   is bounded by Redis availability. Responding first and enqueueing afterwards
   was considered and rejected: it would report success to GitHub while silently
   losing the review. The proportionate mitigation would be a short timeout on
   the enqueue with an explicit 503, which is not implemented.

2. Octokit normalises transport failures into HTTP-shaped errors, so a dropped
   connection and a genuine GitHub 500 are indistinguishable to code branching
   on error status. Observed directly: a Nock `replyWithError` surfaced as a 500.

3. Nock mocks encode the GitHub and Anthropic response shapes as of the time of
   writing. If either provider changes their format, the mocks become fiction and
   the suite will still pass. A periodic live contract test, gated on a separate
   environment variable and excluded from CI, would close this gap.

4. Integration tests run serially (`--no-file-parallelism`) because parallel
   container startup is unreliable on a two-core GitHub Actions runner.

5. No load or soak testing. Behaviour under many simultaneous webhooks is
   untested.

6. 100% coverage measures execution, not assertion quality. Every line runs;
   that is not the same as every behaviour being verified.

## Bugs and risks found

Found by reading the code:

1. **Unverifiable webhooks when the secret is missing.** `GITHUB_WEBHOOK_SECRET`
   defaulted to an empty string, so Argus would start up healthy while accepting
   forged signatures. FIXED: the app now refuses to start.

2. **Unhandled JSON parse.** A correctly signed but malformed body throws inside
   the handler instead of returning 400. Not fixed.

3. **No pagination.** `fetchPrFiles` requests 30 files and never paginates, so
   pull requests larger than that are silently reviewed in part. Not fixed.

4. **Comment posted before persistence.** `postPrComment` runs before
   `saveReview`, with no idempotency key, so a database failure followed by a
   retry would post a duplicate comment. Not fixed.

5. **No retries configured.** BullMQ jobs use the default single attempt, so no
   failure is ever retried. Retry behaviour is therefore not testable as built.

6. **No pool error handler.** A dropped idle PostgreSQL connection emits an
   unhandled error event, which terminates the process. Not fixed.

7. **Greedy JSON extraction.** The regex in `llm.ts` matches from the first
   bracket to the last, so surrounding prose containing brackets can break
   parsing and silently discard real findings. Not fixed.

8. **No runtime validation of Claude output.** `JSON.parse(...) as Finding[]`
   does no runtime check, so an unexpected severity or a missing field flows
   through untyped. Not fixed.

9. **Health check is liveness only.** It reports ok without checking PostgreSQL
   or Redis, so Argus can look healthy while unable to process any review.
   Not fixed.

10. **`getLatestPrNumber` uses `state: 'all'`.** A job without a pull request
    number can review and comment on a closed or merged pull request. Not fixed.

Found only by running the suite on a clean Linux CI runner, none of which
reproduced locally on macOS:

11. **Undeclared dependency.** `dotenv` was imported by four source files but
    absent from `package.json`. It worked locally because another package had
    pulled it into `node_modules`; `npm ci` on a clean runner installs strictly
    from the lockfile, and the type check failed. FIXED.

12. **Test setup blocked the Docker daemon.** The Nock configuration used an
    allowlist of `localhost`, which matched on macOS but not on Linux, where the
    Docker socket is at `/var/run/docker.sock`. Testcontainers could not start
    and all 11 integration tests were skipped. FIXED by blocking only the two
    external API hosts instead.

13. **Container contention on a two-core runner.** Parallel container startup
    plus the Testcontainers reaper produced `write EPIPE` with no usable stack
    trace. FIXED with `TESTCONTAINERS_RYUK_DISABLED` and serial execution.

14. **Duplicate work in the pipeline.** The workflow ran the integration tests
    twice, once directly and once inside the coverage run, doubling container
    startups per build. FIXED by removing the separate step.

## Security review

TODO — write this yourself. Cover: the HMAC verification path and the
length check before `timingSafeEqual` (without it, a short garbage header throws
a RangeError and returns 500 instead of a clean 401); that `.env` is gitignored
and `.env.example` holds placeholders only; that CI requires no credentials at
all; that the tests use a fake Anthropic key so no real key exists in the repo
or in Actions secrets; and the default connection string in `db.ts` which
contains a password in committed source and should be removed.

## CI strategy

Every push and pull request runs: type check, fast unit and API tests, then the
full suite with the coverage threshold enforced. The build fails on a type
error, a failing test, or a coverage shortfall.

The threshold gate was verified by temporarily setting the statements threshold
above 100 and confirming the command exits non-zero, rather than assuming an
always-green gate was working.
