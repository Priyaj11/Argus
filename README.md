# Argus

An automated GitHub bot that reviews pull requests using an LLM (Claude) and posts the feedback as a comment on the PR. Built from scratch with Node.js + TypeScript.

## What it does

When a pull request is opened, the bot automatically:

1. Receives a webhook from GitHub (and verifies it's genuine).
2. Fetches the code that changed in the PR.
3. Sends that code to Claude for review.
4. Posts the findings as a comment on the pull request.
5. Logs the review to a database.

All of this happens on its own, within seconds of opening a PR.

## Architecture

```
GitHub: pull request opened
   │  webhook (HMAC-verified)
   ▼
Express server  ──►  Redis queue (BullMQ)  ──►  Worker
 (replies in <10s)                                 │
                                                   ▼
             Fetch diff (Octokit) → Review (Claude) → Post comment (GitHub API)
                                                   │
                                                   ▼
                                         Save review to PostgreSQL
```

The queue matters: GitHub expects a response within ~10 seconds, but an AI review can take longer. So the server replies instantly and does the slow work in the background.

## Tech stack

- **Node.js + TypeScript** - the app
- **Express** - webhook receiver + HTTP server
- **BullMQ + Redis** - background job queue
- **PostgreSQL** - review history
- **Anthropic Claude** - the code reviewer
- **Octokit** - GitHub API client
- **ngrok** - public tunnel for local webhook testing

## Project structure

```
src/
  server.ts   # Express entry: webhook + startup
  queue.ts    # Redis / BullMQ queue setup
  worker.ts   # Processes review jobs
  github.ts   # GitHub API: fetch diff, post comment
  llm.ts      # Claude review logic
  db.ts       # Postgres storage
```

## Setup

### Prerequisites

- Node.js 18+
- Docker (for Redis + Postgres)
- An Anthropic API key
- A GitHub personal access token (`repo` scope)

### Steps

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example env file and fill in your values:
   ```bash
   cp .env.example .env
   ```
3. Start Redis and Postgres:
   ```bash
   docker run -d --name aicr-redis -p 6379:6379 redis:7-alpine
   docker run -d --name aicr-postgres \
     -e POSTGRES_USER=reviewer -e POSTGRES_PASSWORD=reviewer_secret \
     -e POSTGRES_DB=ai_reviewer -p 5432:5432 postgres:16-alpine
   ```
4. Run the server:
   ```bash
   npm run dev
   ```
5. Expose it publicly for GitHub to reach:
   ```bash
   ngrok http 3000
   ```
   Then add a webhook in your repo settings (**Settings → Webhooks**) with the payload URL `https://<your-ngrok-url>/webhook`, content type `application/json`, your webhook secret, and the **Pull requests** event.

## How the security check works

Every incoming webhook is signed by GitHub using a shared secret. The server recomputes that signature (HMAC-SHA256) and compares it before doing anything, so only genuine GitHub requests are processed.

## License

MIT

## Testing

Argus has an automated test suite covering unit logic, the HTTP surface,
external API boundaries, and the full end to end workflow against real
infrastructure. The suite runs offline and requires no credentials.

### Running the tests

```bash
npm test                  # unit and API tests, no Docker needed, ~1s
npm run test:unit         # pure logic only
npm run test:api          # Express endpoints via Supertest
npm run test:integration  # real Postgres and Redis, needs Docker
npm run test:all          # everything
npm run test:coverage     # everything, with the coverage threshold enforced
```

Docker must be running for the integration tests. Everything else runs
without Docker and without a network connection.

### Layers

**Unit tests** cover HMAC signature verification, the startup configuration
guard, the GitHub client's request shaping and error handling, and the Claude
response parser including malformed, empty, and non-JSON replies.

**API tests** drive the Express application through Supertest without opening
a network port. They cover the health endpoint and the webhook endpoint's
accept, reject, and ignore paths, asserting on side effects as well as status
codes.

**Nock** intercepts all outbound HTTP calls to the GitHub and Anthropic APIs.
Those two hosts are blocked for the duration of the suite, so any request that
is not explicitly mocked fails the test rather than reaching the real internet.

**Testcontainers** starts real PostgreSQL and Redis containers for the
integration tests. Schema creation, persistence, constraint enforcement, queue
behaviour, and worker execution are exercised against real services rather
than fakes.

### Coverage

Coverage is currently 100% on statements, branches, functions and lines.
Thresholds are set at 97/97/100/97 in `vitest.config.ts` and the test command
exits non-zero when they are violated, which has been verified rather than
assumed.

Two files are excluded: `src/server.ts` and `src/demo.ts`. Both are entry
points that execute on import and expose no callable surface, and importing
`demo.ts` would make a real Anthropic API call.

### Continuous Integration

GitHub Actions runs the full suite on every push and pull request. The
workflow requires no secrets: Nock isolates the external APIs and
Testcontainers provides the databases.
