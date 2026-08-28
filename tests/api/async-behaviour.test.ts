import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { sign, prPayload } from '../helpers/webhook.js';

const addMock = vi.fn();

vi.mock('../../src/queue.js', () => ({
  reviewQueue: { add: addMock },
}));

const { app } = await import('../../src/app.js');

describe('webhook enqueues rather than reviewing inline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addMock.mockResolvedValue({ id: 'job-1' });
  });

  it('responds without calling GitHub or Anthropic', async () => {
    // If the handler ever reviews inline, one of these gets consumed.
    const githubScope = nock('https://api.github.com').get(/.*/).reply(200, []);
    const anthropicScope = nock('https://api.anthropic.com')
      .post(/.*/)
      .reply(200, { content: [] });

    const body = JSON.stringify(prPayload());
    const started = Date.now();

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);

    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(res.text).toBe('queued');
    expect(addMock).toHaveBeenCalledTimes(1);

    // The review work must not have started.
    expect(githubScope.isDone()).toBe(false);
    expect(anthropicScope.isDone()).toBe(false);

    // Comfortably inside GitHub's ten second delivery timeout.
    expect(elapsed).toBeLessThan(1000);
  });
});