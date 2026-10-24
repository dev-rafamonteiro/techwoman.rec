// Healthcheck do container: `node dist/health.js` (sai 0 se a API responde em /health).
const port = process.env['PORT'] || '3000';
try {
  const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}

export {};
