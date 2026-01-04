import { Connection } from '@solana/web3.js';
import { RpcCallResult, RpcErrorInfo } from './types.js';

const DEFAULT_TIMEOUT_MS = 6_000;
const SHORT_TIMEOUT_MS = 1_200;

export class RpcPool {
  private readonly urls: string[];
  private readonly connections: Connection[];
  private currentIndex = 0;
  private readonly timeoutMs: number;
  private readonly usedUrls = new Set<string>();
  private readonly errors: RpcErrorInfo[] = [];

  constructor(urls: string[], timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (urls.length === 0) {
      throw new Error('rpcUrls must not be empty');
    }
    this.urls = urls;
    this.timeoutMs = timeoutMs;
    this.connections = urls.map(
      (url) =>
        new Connection(url, {
          commitment: 'processed',
          disableRetryOnRateLimit: true,
        }),
    );
  }

  getUsedUrls(): string[] {
    return Array.from(this.usedUrls);
  }

  getErrors(): RpcErrorInfo[] {
    return [...this.errors];
  }

  async call<T>(fn: (conn: Connection) => Promise<T>): Promise<RpcCallResult<T>> {
    const startIndex = this.currentIndex;

    for (let offset = 0; offset < this.connections.length; offset += 1) {
      const index = (startIndex + offset) % this.connections.length;
      const conn = this.connections[index];
      const rpcUrl = this.urls[index];
      this.usedUrls.add(rpcUrl);

      try {
        const value = await withTimeout(fn(conn), this.timeoutMs);
        this.currentIndex = index;
        return { ok: true, value, rpcUrl };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.errors.push({ message: err.message, rpcUrl });
        continue;
      }
    }

    const lastIndex = (startIndex + this.connections.length - 1) % this.connections.length;
    return {
      ok: false,
      error: new Error('All RPC endpoints failed'),
      rpcUrl: this.urls[lastIndex],
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`RPC timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function isRpcRejectMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('forbidden') ||
    lower.includes('403')
  );
}

export function isBlockhashNotFoundMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('blockhash not found') || lower.includes('blockhashnotfound');
}

export function parseRpcErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export type ParallelRpcResult<T> = RpcCallResult<T>;

export async function callParallel<T>(
  urls: string[],
  fn: (conn: Connection) => Promise<T>,
  timeoutMs = SHORT_TIMEOUT_MS,
): Promise<ParallelRpcResult<T>[]> {
  const connections = urls.map(
    (url) =>
      new Connection(url, {
        commitment: 'processed',
        disableRetryOnRateLimit: true,
      }),
  );

  return Promise.all(
    connections.map(async (conn, index) => {
      const rpcUrl = urls[index];
      try {
        const value = await withTimeout(fn(conn), timeoutMs);
        return { ok: true, value, rpcUrl };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return { ok: false, error: err, rpcUrl };
      }
    }),
  );
}
