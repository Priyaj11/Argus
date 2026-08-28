import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { sign, prPayload } from '../helpers/webhook.js';

vi.mock('../../src/queue.js', () => ({
  reviewQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) },
}));

const { app } = await import('../../src/app.js');
const { reviewQueue } = await import('../../src/queue.js');

describe('POST /webhook', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues a review job for a correctly signed pull request event', async () => {
    const body = JSON.stringify(prPayload());

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('queued');
    expect(reviewQueue.add).toHaveBeenCalledTimes(1);

    const [jobName, jobData] = (reviewQueue.add as any).mock.calls[0];
    expect(jobName).toBe('review-pr');
    expect(jobData).toEqual({ owner: 'acme', repo: 'widgets', prNumber: 42 });
  });

  it('rejects a bad signature and queues nothing', async () => {
    const body = JSON.stringify(prPayload());

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(body);

    expect(res.status).toBe(401);
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });

  it('rejects a payload that was modified after being signed', async () => {
    const original = JSON.stringify(prPayload());
    const tampered = JSON.stringify(prPayload({ action: 'closed' }));

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(original))
      .send(tampered);

    expect(res.status).toBe(401);
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });

  it('ignores pull request actions outside the relevant list', async () => {
    const body = JSON.stringify(prPayload({ action: 'closed' }));

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('ignored');
    expect(reviewQueue.add).not.toHaveBeenCalled();
  });
});