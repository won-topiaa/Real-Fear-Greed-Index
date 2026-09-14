/**
 * 로컬 개발용 정적 서버. 배포에는 쓰지 않는다(배포는 Cloudflare Pages).
 * 샌드박스 폰에서 보려면 `cloudflared tunnel --url http://localhost:8787` 로 HTTPS URL 을 만든다(DESIGN §3.7).
 */
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { Logger } from './types';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

export function cacheControlFor(urlPath: string): string {
  if (urlPath.endsWith('/v1/status.json')) return 'public, max-age=60';
  if (urlPath.endsWith('/v1/snapshot.json')) return 'public, max-age=600, stale-while-revalidate=86400';
  if (urlPath.startsWith('/static/')) return 'public, max-age=86400';
  return 'no-store';
}

export function startStaticServer(opts: { dir: string; port: number; log?: Logger }): Promise<Server> {
  const server = createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(opts.dir, safe);
    try {
      const s = await stat(filePath);
      if (!s.isFile()) throw new Error('not file');
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': cacheControlFor(urlPath),
        'Access-Control-Allow-Origin': '*',
        'Content-Length': body.length,
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', path: urlPath } }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, () => {
      opts.log?.info(`static server on http://localhost:${opts.port} (dir ${opts.dir})`);
      resolve(server);
    });
  });
}
