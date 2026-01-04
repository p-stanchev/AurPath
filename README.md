# AurPath

AurPath is a standalone, open-source tool for tracing Solana transaction outcomes and classifying failure stages. It works with any RPC endpoint set and does **not** depend on AurFlow, while leaving room for a future optional AurFlow adapter.

## Features

- Trace propagation and inclusion across RPC endpoints
- Poll transaction status transitions (processed -> confirmed -> finalized)
- Best-effort failure classification
- Machine-readable JSON output
- CLI, library API, and a minimal HTTP server

## Install

```bash
npm install
npm run build
```

## CLI

```bash
# Trace a signature
node dist/cli.js trace --sig <SIG> --rpc https://rpc1,https://rpc2

# Submit and trace a raw transaction (base64)
node dist/cli.js submit-trace --rpc https://rpc1,https://rpc2 --raw <BASE64>

# Or, after npm install -g
aurpath trace --sig <SIG> --rpc https://rpc1,https://rpc2
aurpath submit-trace --rpc https://rpc1,https://rpc2 --raw <BASE64>

# Start HTTP server
node dist/cli.js serve --port 8787 --rpc https://rpc1,https://rpc2
```

## Library

```ts
import { traceTransaction } from 'aurpath';

const result = await traceTransaction({
  signature: '<SIG>',
  rpcUrls: ['https://rpc1', 'https://rpc2'],
  timeoutMs: 45_000,
});
```

## JSON Output Example

```json
{
  "signature": "5w7...",
  "submit_time": "2026-04-01T20:33:00.000Z",
  "rpc_used": ["https://rpc1", "https://rpc2"],
  "observed_status": [
    {
      "status": "processed",
      "slot": 234567890,
      "observedAtMs": 1200,
      "rpcUrl": "https://rpc1"
    },
    {
      "status": "confirmed",
      "slot": 234567891,
      "observedAtMs": 4500,
      "rpcUrl": "https://rpc1"
    }
  ],
  "error": null,
  "classification": "LEADER_OR_CONGESTION",
  "evidence": {
    "rpcUrl": "https://rpc1",
    "slot": 234567891,
    "confirmationStatus": "confirmed",
    "err": null,
    "logsSnippet": null,
    "blockTime": 1712000000,
    "lastValidBlockHeight": 234567999,
    "rpcUrlsUsed": ["https://rpc1", "https://rpc2"],
    "rpcDisagreement": true,
    "perRpc": [
      {
        "rpcUrl": "https://rpc1",
        "confirmationStatus": "confirmed",
        "slot": 234567891,
        "err": null,
        "blockTime": 1712000000,
        "logsSnippet": null
      },
      {
        "rpcUrl": "https://rpc2",
        "confirmationStatus": "processed",
        "slot": 234567880,
        "err": null,
        "blockTime": null,
        "logsSnippet": null
      }
    ],
    "selected": {
      "rpcUrl": "https://rpc1",
      "confirmationStatus": "confirmed",
      "slot": 234567891,
      "err": null,
      "blockTime": 1712000000,
      "logsSnippet": null
    }
  }
}
```

## Limitations

AurPath provides best-effort classification based on available RPC evidence. It cannot perfectly distinguish censorship from leader congestion without additional observers, and RPC nodes may have incomplete or delayed views of the cluster.

## Development

```bash
npm run lint
npm run test
npm run build
```

## License

Apache-2.0
