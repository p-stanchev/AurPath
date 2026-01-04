import { TraceClassification, TimelineEvent, TraceEvidence, PerRpcObservation } from './types.js';

export type ClassificationInput = {
  selected?: PerRpcObservation;
  err?: unknown;
  timeline: TimelineEvent[];
  evidence: TraceEvidence;
  rpcErrors: string[];
  observedDurationMs: number;
  currentBlockHeight?: number;
  pendingThresholdMs: number;
};

export type ClassificationOutput = {
  classification: TraceClassification;
  confidence: number;
  negative_proofs: string[];
  error?: string;
};

export function classify(input: ClassificationInput): ClassificationOutput {
  const { selected, err, observedDurationMs, currentBlockHeight } = input;
  const confirmationStatus = selected?.confirmationStatus;

  if (confirmationStatus === 'finalized' && err == null) {
    return buildResult('FINALIZED_OK', input);
  }

  if (err != null) {
    return buildResult('EXECUTION_ERROR', input, stringifyError(err));
  }

  if (
    confirmationStatus == null &&
    input.evidence.lastValidBlockHeight != null &&
    currentBlockHeight != null &&
    currentBlockHeight > input.evidence.lastValidBlockHeight
  ) {
    return buildResult('BLOCKHASH_EXPIRED', input);
  }

  if (confirmationStatus == null && observedDurationMs >= input.pendingThresholdMs) {
    return buildResult('NOT_PROPAGATED', input);
  }

  if (
    confirmationStatus != null &&
    confirmationStatus !== 'finalized' &&
    observedDurationMs >= input.pendingThresholdMs
  ) {
    return buildResult('LEADER_OR_CONGESTION', input);
  }

  return buildResult('LEADER_OR_CONGESTION', input);
}

function stringifyError(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function buildResult(
  classification: TraceClassification,
  input: ClassificationInput,
  error?: string,
): ClassificationOutput {
  const confidence = computeConfidence(classification, input);
  const negative_proofs = computeNegativeProofs(classification, input);
  return { classification, confidence, negative_proofs, error };
}

function computeConfidence(
  classification: TraceClassification,
  input: ClassificationInput,
): number {
  const perRpcCount = input.evidence.perRpc?.length ?? 0;
  const base =
    !input.evidence.rpcDisagreement && perRpcCount >= 2
      ? 0.85
      : perRpcCount === 1
        ? 0.65
        : 0.5;

  const adjustment = (() => {
    switch (classification) {
      case 'FINALIZED_OK':
        return 0.1;
      case 'EXECUTION_ERROR':
        return 0.05;
      case 'BLOCKHASH_EXPIRED':
        return 0.05;
      case 'NOT_PROPAGATED':
        return -0.1;
      case 'LEADER_OR_CONGESTION':
        return -0.15;
      case 'RPC_REJECT':
      case 'PREFLIGHT_FAIL':
        return 0.0;
    }
  })();

  return clamp01(base + adjustment);
}

function computeNegativeProofs(
  classification: TraceClassification,
  input: ClassificationInput,
): string[] {
  const proofs: string[] = [];
  const confirmationStatus = input.selected?.confirmationStatus;
  const timedOut = input.observedDurationMs >= input.pendingThresholdMs;

  if (classification === 'LEADER_OR_CONGESTION') {
    if (timedOut) {
      proofs.push('finality_not_reached_before_timeout');
    }
    if (input.err == null) {
      proofs.push('no_execution_error_observed');
    }
  }

  if (classification === 'NOT_PROPAGATED') {
    proofs.push('never_observed_on_chain');
    if (input.evidence.lastValidBlockHeight == null) {
      proofs.push('last_valid_blockheight_unknown');
    }
  }

  if (classification === 'BLOCKHASH_EXPIRED') {
    proofs.push('last_valid_blockheight_passed');
  }

  if (classification === 'FINALIZED_OK') {
    proofs.push('execution_error_absent');
  }

  if (classification === 'EXECUTION_ERROR') {
    proofs.push('execution_error_observed');
  }

  if (confirmationStatus == null && input.err == null && timedOut) {
    proofs.push('no_confirmation_status_before_timeout');
  }

  return proofs;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(2));
}
