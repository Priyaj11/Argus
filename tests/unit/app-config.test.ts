import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/queue.js', () => ({ reviewQueue: { add: vi.fn() } }));

const { createApp } = await import('../../src/app.js');

describe('createApp configuration guard', () => {
  it('refuses to build the app without a webhook secret', () => {
    const saved = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    try {
      expect(() => createApp()).toThrow(/GITHUB_WEBHOOK_SECRET/);
    } finally {
      process.env.GITHUB_WEBHOOK_SECRET = saved;
    }
  });
});
