import { describe, expect, it } from 'vitest';
import { classify } from '../src/classify.js';

function baseInput() {
  return {
    selected: undefined,
    err: undefined,
    timeline: [],
    evidence: {},
    rpcErrors: [],
    observedDurationMs: 0,
    currentBlockHeight: undefined,
    pendingThresholdMs: 10_000,
  };
}

describe('classify', () => {
  it('returns FINALIZED_OK when finalized and no error', () => {
    const result = classify({
      ...baseInput(),
      selected: { rpcUrl: 'rpc', confirmationStatus: 'finalized', slot: 1 },
    });

    expect(result.classification).toBe('FINALIZED_OK');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.negative_proofs.length).toBeGreaterThan(0);
  });

  it('returns EXECUTION_ERROR when err exists', () => {
    const result = classify({
      ...baseInput(),
      selected: { rpcUrl: 'rpc', confirmationStatus: 'confirmed', slot: 1 },
      err: { InstructionError: [0, 'Custom'] },
    });

    expect(result.classification).toBe('EXECUTION_ERROR');
    expect(result.negative_proofs).toContain('execution_error_observed');
  });

  it('returns EXECUTION_ERROR even if finalized when err exists', () => {
    const result = classify({
      ...baseInput(),
      selected: { rpcUrl: 'rpc', confirmationStatus: 'finalized', slot: 2 },
      err: 'custom error',
    });

    expect(result.classification).toBe('EXECUTION_ERROR');
  });

  it('returns BLOCKHASH_EXPIRED when lastValidBlockHeight passed', () => {
    const result = classify({
      ...baseInput(),
      evidence: { lastValidBlockHeight: 100 },
      currentBlockHeight: 120,
      observedDurationMs: 15_000,
    });

    expect(result.classification).toBe('BLOCKHASH_EXPIRED');
    expect(result.negative_proofs).toContain('last_valid_blockheight_passed');
  });

  it('returns NOT_PROPAGATED when never observed and timeout reached', () => {
    const result = classify({
      ...baseInput(),
      observedDurationMs: 12_000,
    });

    expect(result.classification).toBe('NOT_PROPAGATED');
    expect(result.negative_proofs).toContain('never_observed_on_chain');
  });

  it('returns LEADER_OR_CONGESTION when confirmed but not finalized at timeout', () => {
    const result = classify({
      ...baseInput(),
      selected: { rpcUrl: 'rpc', confirmationStatus: 'confirmed', slot: 8 },
      observedDurationMs: 12_000,
    });

    expect(result.classification).toBe('LEADER_OR_CONGESTION');
    expect(result.negative_proofs).toContain('finality_not_reached_before_timeout');
  });

  it('returns ROLLED_BACK when finality is not stable', () => {
    const result = classify({
      ...baseInput(),
      evidence: { finalizedRollback: true },
    });

    expect(result.classification).toBe('ROLLED_BACK');
    expect(result.negative_proofs).toContain('finality_not_stable');
  });

  it('returns FORK_TRANSIENT when ancestry changed', () => {
    const result = classify({
      ...baseInput(),
      evidence: { forkAncestryChanged: true },
    });

    expect(result.classification).toBe('FORK_TRANSIENT');
    expect(result.negative_proofs).toContain('fork_ancestry_changed');
  });
});
