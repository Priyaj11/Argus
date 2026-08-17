import express from 'express';
import crypto from 'crypto';
import 'dotenv/config';
import { reviewQueue } from './queue.js';
import { startWorker } from './worker.js';
import { initDb } from './db.js';

const app = express();
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('x-hub-signature-256') ?? '';
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex');
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    console.log('Rejected: bad signature');
    return res.status(401).send('invalid signature');
  }

  const event = JSON.parse(req.body.toString());

  // Only review on these PR actions.
  const relevant = ['opened', 'reopened', 'synchronize'];
  if (event.pull_request && !relevant.includes(event.action)) {
    console.log(`Ignoring PR action: ${event.action}`);
    return res.status(200).send('ignored');
  }

  await reviewQueue.add('review-pr', {
    owner: event.repository?.owner?.login ?? event.owner,
    repo: event.repository?.name ?? event.repo,
    prNumber: event.pull_request?.number ?? event.prNumber,
  });
  console.log('Queued a review job, replying immediately');
  res.status(200).send('queued');
});

initDb()
  .then(() => console.log('Database ready'))
  .catch((err) => console.log('Database init failed:', err.message));

startWorker();

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});