import crypto from 'crypto';

export const TEST_SECRET = 'test-secret';

export function sign(body: string, secret: string = TEST_SECRET): string {
  return (
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  );
}

export function prPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'opened',
    pull_request: { number: 42 },
    repository: { name: 'widgets', owner: { login: 'acme' } },
    ...overrides,
  };
}