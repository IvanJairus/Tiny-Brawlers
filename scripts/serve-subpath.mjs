import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const prefix = process.env.SUBPATH_PREFIX ?? '/Tiny-Brawlers';
const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 4183);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.map': 'application/json'
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix) {
    res.writeHead(404).end('outside the repo subpath');
    return;
  }
  let relative = url.pathname.slice(prefix.length) || '/';
  if (relative.endsWith('/')) relative += 'index.html';
  const target = normalize(join(root, relative));
  if (!target.startsWith(root)) {
    res.writeHead(403).end('no');
    return;
  }
  try {
    const body = await readFile(target.endsWith('/') ? join(target, 'index.html') : target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' }).end(body);
  } catch {
    // A static host with no SPA fallback: a missing file stays missing, which is
    // what makes this a useful place to test a repo-subpath deploy.
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`missing ${relative}`);
  }
}).listen(port, () => {
  console.log(`subpath host: http://localhost:${port}${prefix}/ serving ${root}`);
});
