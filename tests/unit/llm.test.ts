import { describe, it, expect } from 'vitest';
import nock from 'nock';
import { reviewCode } from '../../src/llm.js';

const ANTHROPIC = 'https://api.anthropic.com';

function claudeReply(text: string) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

const oneFile = [{ filename: 'src/a.ts', patch: '@@ -1 +1 @@\n-a\n+b' }];

describe('reviewCode', () => {
  it('returns no findings and calls no API when nothing has a patch', async () => {
    // Net connect is disabled, so a real call here would throw.
    await expect(
      reviewCode([{ filename: 'logo.png' }])
    ).resolves.toEqual([]);
  });

  it('parses a clean JSON array of findings', async () => {
    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(
        200,
        claudeReply(
          '[{"file":"src/a.ts","line":3,"severity":"warning","comment":"unused variable"}]'
        )
      );

    await expect(reviewCode(oneFile)).resolves.toEqual([
      { file: 'src/a.ts', line: 3, severity: 'warning', comment: 'unused variable' },
    ]);
  });

  it('extracts the array even when Claude wraps it in markdown fences', async () => {
    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(
        200,
        claudeReply('```json\n[{"file":"a.ts","severity":"info","comment":"ok"}]\n```')
      );

    const findings = await reviewCode(oneFile);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe('a.ts');
  });

  it('returns no findings when Claude replies with prose and no array', async () => {
    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(200, claudeReply('I could not find anything wrong with this diff.'));

    await expect(reviewCode(oneFile)).resolves.toEqual([]);
  });

  it('returns no findings when the array is malformed JSON', async () => {
    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(200, claudeReply('[{"file":"a.ts", "severity":}]'));

    await expect(reviewCode(oneFile)).resolves.toEqual([]);
  });

  it('returns no findings when the response has no text block', async () => {
    nock(ANTHROPIC).post('/v1/messages').reply(200, {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5-20251001',
      content: [],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 0 },
    });

    await expect(reviewCode(oneFile)).resolves.toEqual([]);
  });

  it('truncates the diff to 12000 characters and sends the review system prompt', async () => {
    let sent: any;
    nock(ANTHROPIC)
      .post('/v1/messages', (body) => {
        sent = body;
        return true;
      })
      .reply(200, claudeReply('[]'));

    await reviewCode([{ filename: 'big.ts', patch: 'x'.repeat(20000) }]);

    expect(sent.messages[0].content).toHaveLength(12000);
    expect(sent.model).toBe('claude-haiku-4-5-20251001');
    expect(sent.system).toContain('senior code reviewer');
  });
});