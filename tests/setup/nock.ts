import { beforeAll, afterEach, afterAll } from 'vitest';
import nock from 'nock';

beforeAll(() => {
  nock.disableNetConnect();
  // Supertest binds a local port, so localhost has to stay reachable.
  nock.enableNetConnect((host) => /^(127\.0\.0\.1|localhost)/.test(host));
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});