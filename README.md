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

- **Node.js + TypeScript** — the app
- **Express** — webhook receiver + HTTP server
- **BullMQ + Redis** — background job queue
- **PostgreSQL** — review history
- **Anthropic Claude** — the code reviewer
- **Octokit** — GitHub API client
- **ngrok** — public tunnel for local webhook testing

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

Every incoming webhook is signed by GitHub using a shared secret. The server recomputes that signature (HMAC-SHA256) and compares it before doing anything — so only genuine GitHub requests are processed.

## License

MIT
