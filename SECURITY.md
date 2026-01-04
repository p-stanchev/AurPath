# Security Policy

## Scope & Limitations

AurPath is a **read-only tracing and analysis tool** for Solana transactions. The following important limitations apply:

### What AurPath Does NOT Do

- **Does not hold or transfer funds**: AurPath never manages wallets, private keys, or performs any on-chain transactions. It only reads transaction history and status from RPC endpoints.
- **Does not sign transactions**: All transaction submission and signing must be performed by external tools or SDKs.
- **Does not guarantee classification accuracy**: Failure classification is best-effort, based on evidence from queried RPC endpoints. RPC nodes may have incomplete or delayed views of the cluster state.

### Best-Effort Tracing

AurPath's classification logic attempts to correlate evidence from multiple RPC endpoints to infer transaction failure causes. However:

- RPC endpoints may temporarily disagree on transaction status or error details
- Network partitions may prevent full visibility into the cluster's consensus state
- Transaction failures can stem from multiple causes; observed symptoms may be consistent with more than one root cause
- Results should be used for **monitoring and debugging**, not as authoritative proof of transaction finality or failure

## Reporting Security Issues

If you discover a security vulnerability in AurPath's code or believe the tool is being misused to harm users:

1. **Do not open a public issue** on GitHub
2. **Contact the maintainers privately** with details of the issue
3. **Include steps to reproduce** and potential impact assessment

Responsible disclosure allows maintainers time to address issues before public knowledge.

## Safe Usage Practices

- **Use trusted RPC endpoints**: AurPath's output is only as trustworthy as the RPC nodes it queries
- **Verify with multiple sources**: Never rely on AurPath's classification as sole evidence in critical decisions
- **Keep AurPath updated**: Use the latest version to benefit from bug fixes and improvements
- **Audit before production**: Test AurPath in non-production environments before integrating into critical workflows

## Known Limitations

- **Slot timing**: Transaction observations are timestamped locally; network latency can affect perceived timing
- **RPC disagreement**: Different RPCs may report different confirmation statuses due to reorg depth or state sync delays
- **Incomplete logs**: Some transactions may not emit transaction logs; AurPath relies on RPC availability of this data
- **Version sensitivity**: Solana cluster upgrades and RPC endpoint versions may affect classification accuracy

## Version

AurPath follows semantic versioning. Patch versions (`0.x.z`) may include security fixes without API changes. Always update to the latest patch version in your used minor version.

## Disclaimer

AurPath is provided as-is for educational and operational monitoring purposes. Users are solely responsible for assessing its suitability for their use cases and for validating its outputs in critical systems.
