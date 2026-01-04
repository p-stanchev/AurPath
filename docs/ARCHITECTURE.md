# AurPath Architecture

AurPath is a standalone transaction tracing engine that talks directly to Solana RPC endpoints. It does not depend on AurFlow or any external routing service. The core execution path is:

1. Rotate through RPC endpoints to collect status and transaction evidence.
2. Build a status timeline from processed/confirmed/finalized transitions.
3. Build a quorum view from parallel RPC polling to reduce single-node bias.
4. Produce a causal phase graph of submit/propagation/execution stages with confidence.
5. Classify the outcome using deterministic rules, including fork/rollback signals when evidence regresses.
6. Emit structured JSON for automation and downstream analysis.

## Standalone Design

- No shared config or code with AurFlow.
- RPC access is encapsulated in `src/rpc.ts` and can be replaced or extended without affecting classification logic.
- Classification rules live in `src/classify.ts` and operate purely on evidence, enabling repeatability.
- Submit-time tracing runs a preflight simulation, captures submission errors, and then falls through to the standard trace loop on success.

## Future Optional AurFlow Adapter

A future adapter can remain optional and external to AurPath. Suggested approach:

- Adapter reads AurFlow routing decisions (e.g., chosen RPCs, retries, preflight results).
- Adapter attaches these decisions to AurPath evidence without changing the core tracing logic.
- AurPath remains the authority on classification; the adapter only enriches evidence and context.

This keeps AurPath usable on its own while allowing deeper integrations where AurFlow is present.
