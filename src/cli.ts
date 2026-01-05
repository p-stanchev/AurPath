import { Command } from 'commander';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { decodeBase64Transaction, submitAndTrace, traceTransaction } from './trace.js';

const program = new Command();

program
  .name('aurpath')
  .description('Solana transaction outcome tracing and failure classification')
  .version('0.1.0');

program
  .command('trace')
  .description('Trace a Solana transaction by signature')
  .requiredOption('--sig <signature>', 'Transaction signature')
  .requiredOption('--rpc <urls>', 'Comma-separated RPC URLs')
  .option('--timeout <ms>', 'Timeout in milliseconds', (value) => Number(value))
  .option('--per-tick-timeout-ms <ms>', 'Per-RPC timeout per poll tick', (value) => Number(value))
  .action(async (options) => {
    const rpcUrls = String(options.rpc)
      .split(',')
      .map((url: string) => url.trim())
      .filter(Boolean);

    const result = await traceTransaction({
      signature: options.sig,
      rpcUrls,
      timeoutMs: options.timeout,
      perTickTimeoutMs: options.perTickTimeoutMs,
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program
  .command('submit-trace')
  .description('Submit a raw transaction and trace the outcome')
  .requiredOption('--rpc <urls>', 'Comma-separated RPC URLs')
  .requiredOption('--raw <base64>', 'Base64-encoded transaction')
  .option('--skip-preflight', 'Skip preflight simulation', false)
  .option('--timeout-ms <ms>', 'Timeout in milliseconds', (value) => Number(value), 45_000)
  .option('--per-tick-timeout-ms <ms>', 'Per-RPC timeout per poll tick', (value) => Number(value))
  .action(async (options) => {
    const rpcUrls = String(options.rpc)
      .split(',')
      .map((url: string) => url.trim())
      .filter(Boolean);

    const rawTransaction = decodeBase64Transaction(String(options.raw));
    const result = await submitAndTrace({
      rpcUrls,
      rawTransaction,
      skipPreflight: Boolean(options.skipPreflight),
      timeoutMs: options.timeoutMs,
      perTickTimeoutMs: options.perTickTimeoutMs,
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program
  .command('serve')
  .description('Start a minimal HTTP server for trace requests')
  .option('--port <port>', 'Port to listen on', (value) => Number(value), 8787)
  .requiredOption('--rpc <urls>', 'Comma-separated RPC URLs')
  .action((options) => {
    const rpcUrls = String(options.rpc)
      .split(',')
      .map((url: string) => url.trim())
      .filter(Boolean);

    const viewerRoot = resolveViewerRoot();
    const server = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing URL' }));
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/viewer' || url.pathname === '/viewer/') {
        return serveStatic(res, path.join(viewerRoot, 'index.html'), 'text/html');
      }
      if (url.pathname === '/viewer/viewer.js') {
        return serveStatic(res, path.join(viewerRoot, 'viewer.js'), 'text/javascript');
      }
      if (url.pathname !== '/trace') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const sig = url.searchParams.get('sig');
      if (!sig) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sig query parameter' }));
        return;
      }

      try {
        const result = await traceTransaction({ signature: sig, rpcUrls });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });

    server.listen(options.port, () => {
      process.stdout.write(`AurPath server listening on :${options.port}\n`);
    });
  });

program.parseAsync(process.argv);

function resolveViewerRoot(): string {
  const cwd = process.cwd();
  const srcPath = path.join(cwd, 'src', 'viewer');
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }
  return path.join(cwd, 'dist', 'viewer');
}

function serveStatic(
  res: http.ServerResponse,
  filePath: string,
  contentType: string,
): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}
