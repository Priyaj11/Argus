import { Worker } from 'bullmq';
import { connection } from './queue.js';
import { fetchPrFiles, getLatestPrNumber, postPrComment } from './github.js';
import { reviewCode } from './llm.js';
import { saveReview } from './db.js';

export function startWorker(): Worker {
  const worker = new Worker(
    'reviews',
    async (job) => {
      const { owner, repo } = job.data as { owner: string; repo: string; prNumber?: number };
      let prNumber = (job.data as { prNumber?: number }).prNumber;
      if (!prNumber) prNumber = (await getLatestPrNumber(owner, repo)) ?? undefined;
      if (!prNumber) {
        console.log('No PR found.');
        return;
      }

      console.log(`Reviewing ${owner}/${repo} PR #${prNumber}`);
      const files = await fetchPrFiles(owner, repo, prNumber);
      const findings = await reviewCode(files);
      console.log(`Claude found ${findings.length} issue(s)`);

      const body =
        findings.length === 0
          ? 'AI Code Review: No issues found. Nice work!'
          : `AI Code Review found ${findings.length} issue(s):\n\n` +
            findings
              .map(
                (f) =>
                  `- [${f.severity}] \`${f.file}${f.line ? ':' + f.line : ''}\` - ${f.comment}`
              )
              .join('\n');

      await postPrComment(owner, repo, prNumber, body);
      console.log('Posted review comment to the PR!');

      await saveReview(owner, repo, prNumber, findings.length);
      console.log('Saved review to database.');
    },
    { connection }
  );

  worker.on('failed', (job, err) => console.log('Job failed', job?.id, err.message));
  console.log('Worker started, waiting for jobs...');
  return worker;
}