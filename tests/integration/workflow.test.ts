import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { Worker } from 'bullmq';

const GITHUB = 'https://api.github.com';
const ANTHROPIC = 'https://api.anthropic.com';

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let db: typeof import('../../src/db.js');
let queue: typeof import('../../src/queue.js');
let worker: Worker;

function claudeReply(text: string) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function settled(jobId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    worker.on('completed', (job) => {
      if (job.id === jobId) resolve({ ok: true });
    });
    worker.on('failed', (job, err) => {
      if (job?.id === jobId) resolve({ ok: false, error: err.message });
    });
  });
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine').start();
  redis = await new RedisContainer('redis:7-alpine').start();

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();

  db = await import('../../src/db.js');
  queue = await import('../../src/queue.js');
  const workerModule = await import('../../src/worker.js');

  await db.initDb();
  worker = workerModule.startWorker();
}, 240_000);

afterAll(async () => {
  await worker?.close();
  await queue?.reviewQueue.close();
  await queue?.connection.quit();
  await db?.pool.end();
  await redis?.stop();
  await pg?.stop();
});

describe('end to end review workflow', () => {
  it('fetches the diff, reviews it, comments, and persists the result', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .reply(200, [{ filename: 'src/a.ts', patch: '@@ -1 +1 @@\n-a\n+b' }]);

    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(
        200,
        claudeReply(
          '[{"file":"src/a.ts","line":1,"severity":"error","comment":"off by one"}]'
        )
      );

    let comment: any;
    const commentScope = nock(GITHUB)
      .post('/repos/acme/widgets/issues/42/comments', (body) => {
        comment = body;
        return true;
      })
      .reply(201, { id: 1 });

    const job = await queue.reviewQueue.add('review-pr', {
      owner: 'acme',
      repo: 'widgets',
      prNumber: 42,
    });

    const result = await settled(job.id!);
    expect(result.ok).toBe(true);

    expect(commentScope.isDone()).toBe(true);
    expect(comment.body).toContain('1 issue(s)');
    expect(comment.body).toContain('[error]');
    expect(comment.body).toContain('src/a.ts:1');

    const { rows } = await db.pool.query(
      'SELECT * FROM reviews WHERE owner=$1 AND repo=$2 AND pr_number=$3',
      ['acme', 'widgets', 42]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].issues_found).toBe(1);
  }, 60_000);

  it('posts the clean message and stores zero when Claude finds nothing', async () => {
    nock(GITHUB)
      .get('/repos/acme/clean/pulls/7/files')
      .query({ per_page: 30 })
      .reply(200, [{ filename: 'src/b.ts', patch: '@@ -1 +1 @@\n-x\n+y' }]);

    nock(ANTHROPIC).post('/v1/messages').reply(200, claudeReply('[]'));

    let comment: any;
    nock(GITHUB)
      .post('/repos/acme/clean/issues/7/comments', (body) => {
        comment = body;
        return true;
      })
      .reply(201, { id: 2 });

    const job = await queue.reviewQueue.add('review-pr', {
      owner: 'acme',
      repo: 'clean',
      prNumber: 7,
    });

    const result = await settled(job.id!);
    expect(result.ok).toBe(true);
    expect(comment.body).toContain('No issues found');

    const { rows } = await db.pool.query(
      'SELECT issues_found FROM reviews WHERE repo=$1',
      ['clean']
    );
    expect(rows[0].issues_found).toBe(0);
  }, 60_000);

  it('fails the job and writes nothing when GitHub rejects the diff request', async () => {
    nock(GITHUB)
      .get('/repos/acme/missing/pulls/99/files')
      .query({ per_page: 30 })
      .reply(404, { message: 'Not Found' });

    const job = await queue.reviewQueue.add('review-pr', {
      owner: 'acme',
      repo: 'missing',
      prNumber: 99,
    });

    const result = await settled(job.id!);
    expect(result.ok).toBe(false);

    const { rows } = await db.pool.query(
      'SELECT * FROM reviews WHERE repo=$1',
      ['missing']
    );
    expect(rows).toHaveLength(0);
  }, 60_000);

  it('skips the review when the repository has no pull requests', async () => {
    nock(GITHUB)
      .get('/repos/acme/empty/pulls')
      .query({ state: 'all', per_page: 1 })
      .reply(200, []);

    const job = await queue.reviewQueue.add('review-pr', {
      owner: 'acme',
      repo: 'empty',
    });

    const result = await settled(job.id!);
    expect(result.ok).toBe(true);

    const { rows } = await db.pool.query(
      'SELECT * FROM reviews WHERE repo=$1',
      ['empty']
    );
    expect(rows).toHaveLength(0);
  }, 60_000);
  it('formats a finding that has no line number', async () => {
    nock(GITHUB)
      .get('/repos/acme/noline/pulls/5/files')
      .query({ per_page: 30 })
      .reply(200, [{ filename: 'src/c.ts', patch: '@@ -1 +1 @@\n-p\n+q' }]);

    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(
        200,
        claudeReply(
          '[{"file":"src/c.ts","severity":"info","comment":"consider renaming"}]'
        )
      );

    let comment: any;
    nock(GITHUB)
      .post('/repos/acme/noline/issues/5/comments', (body) => {
        comment = body;
        return true;
      })
      .reply(201, { id: 3 });

    const job = await queue.reviewQueue.add('review-pr', {
      owner: 'acme',
      repo: 'noline',
      prNumber: 5,
    });

    const result = await settled(job.id!);
    expect(result.ok).toBe(true);
    expect(comment.body).toContain('`src/c.ts`');
    expect(comment.body).not.toContain('src/c.ts:');
  }, 60_000);
});
