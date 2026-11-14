import { describe, expect, it } from 'vitest';
import worker from './index.ts';

describe('worker', () => {
  it('GET /api/health に ok を返す', async () => {
    const response = worker.fetch(new Request('https://example.com/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('ほかのパスには 404 を返す', () => {
    const response = worker.fetch(new Request('https://example.com/api/unknown'));
    expect(response.status).toBe(404);
  });
});
