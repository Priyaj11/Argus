import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;
let db: typeof import('../../src/db.js');

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  db = await import('../../src/db.js');
  await db.initDb();
}, 180_000);

afterAll(async () => {
  await db?.pool.end();
  await container?.stop();
});

describe('initDb', () => {
  it('creates a reviews table with the expected columns', async () => {
    const { rows } = await db.pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'reviews'
        ORDER BY ordinal_position`
    );

    expect(rows.map((r) => r.column_name)).toEqual([
      'id',
      'owner',
      'repo',
      'pr_number',
      'issues_found',
      'reviewed_at',
    ]);
    expect(rows.find((r) => r.column_name === 'owner')!.is_nullable).toBe('NO');
  });

  it('is safe to run twice', async () => {
    await expect(db.initDb()).resolves.toBeUndefined();
  });
});

describe('saveReview', () => {
  it('persists a review row and defaults the timestamp', async () => {
    await db.saveReview('acme', 'widgets', 42, 3);

    const { rows } = await db.pool.query(
      'SELECT * FROM reviews WHERE owner = $1 AND repo = $2 AND pr_number = $3',
      ['acme', 'widgets', 42]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].issues_found).toBe(3);
    expect(rows[0].reviewed_at).toBeInstanceOf(Date);
  });

  it('allows a review with zero issues', async () => {
    await db.saveReview('acme', 'clean', 1, 0);
    const { rows } = await db.pool.query(
      'SELECT issues_found FROM reviews WHERE repo = $1',
      ['clean']
    );
    expect(rows[0].issues_found).toBe(0);
  });

  it('stores a second row for the same pull request rather than updating', async () => {
    await db.saveReview('acme', 'dupes', 7, 1);
    await db.saveReview('acme', 'dupes', 7, 2);

    const { rows } = await db.pool.query(
      'SELECT issues_found FROM reviews WHERE repo = $1 ORDER BY id',
      ['dupes']
    );
    expect(rows).toHaveLength(2);
  });

  it('rejects a null owner at the database level', async () => {
    await expect(
      db.pool.query(
        'INSERT INTO reviews (owner, repo, pr_number, issues_found) VALUES ($1,$2,$3,$4)',
        [null, 'widgets', 1, 0]
      )
    ).rejects.toThrow(/null value/i);
  });
});