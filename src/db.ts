import { Pool } from 'pg';
import 'dotenv/config';

// A pool = a set of reusable connections to Postgres.
export const pool = new Pool({
/* v8 ignore next 3 -- local development default, never taken under test */
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://reviewer:reviewer_secret@localhost:5432/ai_reviewer',
});

// Create the reviews table if it doesn't already exist.
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      issues_found INTEGER NOT NULL,
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// Save one review as a new row.
export async function saveReview(
  owner: string,
  repo: string,
  prNumber: number,
  issuesFound: number
): Promise<void> {
  await pool.query(
    'INSERT INTO reviews (owner, repo, pr_number, issues_found) VALUES ($1, $2, $3, $4)',
    [owner, repo, prNumber, issuesFound]
  );
}