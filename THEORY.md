# AurPath Theory

## Confidence

AurPath confidence is a calibrated estimate of how strongly the available evidence supports the classification. It is not a probability of truth. Confidence increases with multiple agreeing RPC observations and decreases when evidence is sparse, conflicting, or only inferred.

Key properties:
- Confidence is capped by the number of valid observers (1 RPC <= 0.85, 2 RPCs <= 0.95, 3+ RPCs <= 0.99).
- Confidence is lowered for ambiguous outcomes like LEADER_OR_CONGESTION or NOT_PROPAGATED.
- Confidence is higher when explicit evidence exists (finalized status, execution error).

## Negative Proofs

Negative proofs are short statements describing what was not observed, and therefore what cannot be concluded. They make traces explicit arguments rather than opaque logs.

Examples:
- `finality_not_reached_before_timeout`
- `no_execution_error_observed`
- `finality_not_stable`
- `fork_ancestry_changed`

## What AurPath Can Prove

- A transaction was observed at a given status by one or more RPCs.
- A transaction finalized on the observed RPC set (best-effort).
- Execution errors when RPCs provide logs or error metadata.
- Evidence of status regressions or fork-related instability on the observed RPCs.

## What AurPath Cannot Prove

- Censorship vs congestion without independent observers.
- Global finality across the entire cluster.
- Execution success for transactions not observed by any RPC.
- That a fork did or did not occur beyond the observed RPC set.
