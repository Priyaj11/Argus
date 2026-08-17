import { Octokit } from '@octokit/rest';
import 'dotenv/config';

// Authenticated with your token → can read AND post comments.
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export interface ChangedFile {
  filename: string;
  patch?: string;
}

export async function fetchPrFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ChangedFile[]> {
  const { data } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 30,
  });
  return data.map((f) => ({ filename: f.filename, patch: f.patch }));
}

export async function getLatestPrNumber(
  owner: string,
  repo: string
): Promise<number | null> {
  const { data } = await octokit.pulls.list({ owner, repo, state: 'all', per_page: 1 });
  return data[0]?.number ?? null;
}

// Post a comment onto the pull request.
export async function postPrComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
}
