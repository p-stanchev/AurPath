# AurPath

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-0.1.0-red.svg)](https://www.npmjs.com/package/aurpath)

AurPath is a standalone, open-source tool for tracing Solana transaction outcomes and classifying failure stages. It works with any RPC endpoint set and does **not** depend on AurFlow, while leaving room for a future optional AurFlow adapter.

## Problem Statement

Solana operators and RPC providers lack visibility into transaction failure root causes. When a transaction fails, a single RPC endpoint's error message is often incomplete or misleading. Failures can stem from leader congestion, network censorship, insufficient balance, or program-level errors—but standard RPC responses don't reliably distinguish between them. AurPath solves this by correlating evidence from multiple RPC endpoints to provide better-effort classification of failure stages.

## What AurPath Does

- **Multi-RPC tracing**: Correlates transaction status and error reports across independent RPC endpoints
- **Failure classification**: Categorizes failures into stages (censorship, leader congestion, account state, etc.) based on available evidence
- **Status tracking**: Polls and records transaction status transitions (processed → confirmed → finalized) with slot numbers
- **Machine-readable output**: Provides detailed JSON with evidence, RPC disagreements, phase graph edges, and logs for integration into monitoring systems
- **Multiple interfaces**: Offers CLI, library API, and HTTP server for flexible integration

## What AurPath Does NOT Do

- **Does not hold funds or execute transactions**: AurPath is a read-only tracing tool. It retrieves transaction history and status; it does not manage wallets or sign transactions.
- **Does not provide guaranteed classification**: Best-effort classification based on RPC evidence. Multiple RPC nodes may have incomplete or delayed views of the cluster.
- **Does not distinguish all failure modes with certainty**: Cannot perfectly distinguish censorship from leader congestion without additional on-chain observers or historical finality data.
- **Does not replace on-chain program verification**: Does not analyze program logic, accounts, or instruction execution. Use Solana validators' own tools for detailed program debugging.
- **Does not guarantee consistency across clusters or network partitions**: RPC nodes may temporarily disagree; results reflect observed evidence at query time.

## Motivation

Standard RPC errors ("BlockhashNotFound", "InsufficientFundsForFee") only reveal *what* the RPC saw, not *why* the transaction failed network-wide. A transaction might succeed on one RPC and fail on another due to clock skew, reorg depth, or network partition. By querying multiple independent RPC endpoints in parallel and correlating their responses, AurPath constructs a richer picture of the transaction's fate. This is especially valuable for operators of high-stakes applications (DEX bots, MEV-aware validators, bridges) where understanding failure root cause impacts recovery strategy and protocol design.

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
node dist/cli.js trace --sig <SIG> --rpc https://rpc1,https://rpc2 --per-tick-timeout-ms 1200

# Submit and trace a raw transaction (base64)
node dist/cli.js submit-trace --rpc https://rpc1,https://rpc2 --raw <BASE64> --per-tick-timeout-ms 1200

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
  "phase_graph": [
    {
      "from": "SUBMIT",
      "to": "RPC_ACCEPTED",
      "timestampMs": 120,
      "source": "rpc:https://rpc1",
      "confidence": 0.6
    },
    {
      "from": "RPC_ACCEPTED",
      "to": "PROPAGATED",
      "timestampMs": 1200,
      "source": "rpc:https://rpc1",
      "confidence": 0.6
    },
    {
      "from": "PROPAGATED",
      "to": "CONFIRMED",
      "timestampMs": 4500,
      "source": "rpc:https://rpc1",
      "confidence": 0.6
    }
  ],
  "confidence": 0.81,
  "negative_proofs": [
    "finality_not_reached_before_timeout",
    "no_execution_error_observed"
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

Licensed under the [Apache License 2.0](LICENSE). See [LICENSE](LICENSE) for details.
