import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/queue.js', () => ({
  reviewQueue: { add: vi.fn() },
}));

const { app } = await import('../../src/app.js');

describe('GET /health', () => {
  it('reports ok with a current timestamp', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Date.parse(res.body.time)).not.toBeNaN();
    expect(Math.abs(Date.now() - Date.parse(res.body.time))).toBeLessThan(5000);
  });

  it('returns JSON', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('404s on an unknown route', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});