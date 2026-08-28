import { describe, it, expect } from 'vitest';
import nock from 'nock';
import {
  fetchPrFiles,
  getLatestPrNumber,
  postPrComment,
} from '../../src/github.js';

const GITHUB = 'https://api.github.com';

describe('fetchPrFiles', () => {
  it('maps the GitHub response down to filename and patch', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .reply(200, [
        { filename: 'src/a.ts', patch: '@@ -1 +1 @@\n-old\n+new', status: 'modified' },
        { filename: 'assets/logo.png', status: 'added' },
      ]);

    const files = await fetchPrFiles('acme', 'widgets', 42);

    expect(files).toEqual([
      { filename: 'src/a.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
      { filename: 'assets/logo.png', patch: undefined },
    ]);
  });

  it('sends the configured token in the authorization header', async () => {
    const scope = nock(GITHUB, {
      reqheaders: { authorization: /test-token/ },
    })
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .reply(200, []);

    await fetchPrFiles('acme', 'widgets', 42);
    expect(scope.isDone()).toBe(true);
  });

  it('returns an empty array when the pull request changed nothing', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .reply(200, []);

    await expect(fetchPrFiles('acme', 'widgets', 42)).resolves.toEqual([]);
  });

  it('propagates a 404 when the pull request does not exist', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/999/files')
      .query({ per_page: 30 })
      .reply(404, { message: 'Not Found' });

    await expect(fetchPrFiles('acme', 'widgets', 999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('propagates a 401 when the token is rejected', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .reply(401, { message: 'Bad credentials' });

    await expect(fetchPrFiles('acme', 'widgets', 42)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('propagates a network failure', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls/42/files')
      .query({ per_page: 30 })
      .replyWithError('socket hang up');

    await expect(fetchPrFiles('acme', 'widgets', 42)).rejects.toThrow();
  });
});

describe('getLatestPrNumber', () => {
  it('returns the number of the most recent pull request', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls')
      .query({ state: 'all', per_page: 1 })
      .reply(200, [{ number: 77 }]);

    await expect(getLatestPrNumber('acme', 'widgets')).resolves.toBe(77);
  });

  it('returns null for a repository with no pull requests', async () => {
    nock(GITHUB)
      .get('/repos/acme/widgets/pulls')
      .query({ state: 'all', per_page: 1 })
      .reply(200, []);

    await expect(getLatestPrNumber('acme', 'widgets')).resolves.toBeNull();
  });
});

describe('postPrComment', () => {
  it('posts the review body to the pull request', async () => {
    let sent: any;
    const scope = nock(GITHUB)
      .post('/repos/acme/widgets/issues/42/comments', (body) => {
        sent = body;
        return true;
      })
      .reply(201, { id: 1 });

    await postPrComment('acme', 'widgets', 42, 'Looks good to me');

    expect(scope.isDone()).toBe(true);
    expect(sent).toEqual({ body: 'Looks good to me' });
  });

  it('propagates a 403 when commenting is not permitted', async () => {
    nock(GITHUB)
      .post('/repos/acme/widgets/issues/42/comments')
      .reply(403, { message: 'Resource not accessible by integration' });

    await expect(
      postPrComment('acme', 'widgets', 42, 'hi')
    ).rejects.toMatchObject({ status: 403 });
  });
});