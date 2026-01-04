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
  error?: string;
};

export function classify(input: ClassificationInput): ClassificationOutput {
  const { selected, err, observedDurationMs, currentBlockHeight } = input;
  const confirmationStatus = selected?.confirmationStatus;

  if (confirmationStatus === 'finalized' && err == null) {
    return { classification: 'FINALIZED_OK' };
  }

  if (err != null) {
    return { classification: 'EXECUTION_ERROR', error: stringifyError(err) };
  }

  if (
    confirmationStatus == null &&
    input.evidence.lastValidBlockHeight != null &&
    currentBlockHeight != null &&
    currentBlockHeight > input.evidence.lastValidBlockHeight
  ) {
    return { classification: 'BLOCKHASH_EXPIRED' };
  }

  if (confirmationStatus == null && observedDurationMs >= input.pendingThresholdMs) {
    return { classification: 'NOT_PROPAGATED' };
  }

  if (
    confirmationStatus != null &&
    confirmationStatus !== 'finalized' &&
    observedDurationMs >= input.pendingThresholdMs
  ) {
    return { classification: 'LEADER_OR_CONGESTION' };
  }

  return { classification: 'LEADER_OR_CONGESTION' };
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
