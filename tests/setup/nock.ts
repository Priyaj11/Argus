import { beforeAll, afterEach, afterAll } from 'vitest';
import nock from 'nock';

beforeAll(() => {
  nock.disableNetConnect();
  // Block only the external APIs. Everything else (the Docker daemon used by
  // Testcontainers, the containers themselves, and Supertest's local port)
  // must stay reachable.
  nock.enableNetConnect((host) => !/api\.(github|anthropic)\.com/.test(host));
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
