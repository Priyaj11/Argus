import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ReviewInput {
  filename: string;
  patch?: string;
}
export interface Finding {
  file: string;
  line?: number;
  severity: 'info' | 'warning' | 'error';
  comment: string;
}

export async function reviewCode(files: ReviewInput[]): Promise<Finding[]> {
  const diffText = files
    .filter((f) => f.patch)
    .map((f) => `File: ${f.filename}\n${f.patch}`)
    .join('\n\n')
    .slice(0, 12000);

  if (!diffText.trim()) return [];

  const system = `You are a senior code reviewer. Review the pull request changes.
Respond with ONLY a JSON array of findings, each shaped like:
{"file": "path/to/file", "line": 12, "severity": "warning", "comment": "why it's an issue"}
Severity is one of: info, warning, error. If there are no issues, respond with exactly [].
Do not wrap the JSON in markdown or add any text before or after it.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    temperature: 0.2,
    system,
    messages: [{ role: 'user', content: diffText }],
  });

  const block = response.content.find((b) => b.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '[]';

  // Grab the JSON array even if Claude wrapped it in code fences or extra text.
  const match = raw.match(/\[[\s\S]*\]/);
  const jsonText = match ? match[0] : '[]';

  try {
    return JSON.parse(jsonText) as Finding[];
  } catch {
    console.log('Could not parse Claude reply:\n', raw);
    return [];
  }
}