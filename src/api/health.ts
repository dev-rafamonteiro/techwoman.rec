import { statSync } from 'node:fs';

// Healthcheck do container. API: GET /ready (ping no banco). `node dist/health.js worker`: confere o heartbeat do worker.
if (process.argv[2] === 'worker') {
  try {
    process.exit(Date.now() - statSync('/tmp/worker-alive').mtimeMs < 30_000 ? 0 : 1);
  } catch {
    process.exit(1);
  }
}
const port = process.env['PORT'] || '3000';
try {
  const res = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(3000) });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
export {};
