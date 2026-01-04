import {
  Connection,
  SignatureStatus,
  TransactionResponse,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { classify } from './classify.js';
import {
  callParallel,
  isBlockhashNotFoundMessage,
  isRpcRejectMessage,
  parseRpcErrorMessage,
  RpcPool,
} from './rpc.js';
import {
  PerRpcObservation,
  PhaseEdge,
  SubmitTraceInput,
  TraceEvidence,
  TraceInput,
  TraceResult,
  TimelineEvent,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_000;
const PENDING_THRESHOLD_MS = 15_000;
const BLOCKHEIGHT_REFRESH_MS = 5_000;
const BLOCKHASH_REFRESH_MS = 10_000;
const DEFAULT_QUORUM_K = 2;
const DEFAULT_MAX_RPCS_PER_TICK = 3;

export async function traceTransaction(input: TraceInput): Promise<TraceResult> {
  const { signature, rpcUrls } = input;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return traceLoop({
    signature,
    rpcUrls,
    timeoutMs,
    quorumK: input.quorumK,
    maxRpcsPerTick: input.maxRpcsPerTick,
    perTickTimeoutMs: input.perTickTimeoutMs,
  });
}

export async function submitAndTrace(input: SubmitTraceInput): Promise<TraceResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pool = new RpcPool(input.rpcUrls);
  const submit_time = new Date().toISOString();
  const submitStartMs = Date.now();

  if (!input.skipPreflight) {
    const versioned = VersionedTransaction.deserialize(input.rawTransaction);
    const simResult = await pool.call((conn) =>
      conn.simulateTransaction(versioned, {
        sigVerify: true,
        commitment: 'processed',
      }),
    );
    if (!simResult.ok) {
      return buildSubmitErrorResult({
        submit_time,
        rpcUrlsUsed: pool.getUsedUrls(),
        signature: 'UNKNOWN',
        errorMessage: parseRpcErrorMessage(simResult.error),
        classificationOverride: 'RPC_REJECT',
      });
    }

    if (simResult.value.value.err != null) {
      const logs = simResult.value.value.logs ?? [];
      const evidence: TraceEvidence = {
        rpcUrl: simResult.rpcUrl,
        err: simResult.value.value.err,
        logsSnippet: logs.slice(0, 6).join('\n') || undefined,
      };
      return {
        signature: 'UNKNOWN',
        submit_time,
        rpc_used: pool.getUsedUrls(),
        observed_status: [],
    phase_graph: buildPhaseGraph({
      observed_status: [],
      evidence,
      submitAccepted: false,
    }),
        error: stringifyError(simResult.value.value.err),
        classification: 'PREFLIGHT_FAIL',
        evidence,
      };
    }
  }

  const sendResult = await pool.call((conn) =>
    conn.sendRawTransaction(input.rawTransaction, {
      skipPreflight: input.skipPreflight ?? false,
      preflightCommitment: 'processed',
    }),
  );

  if (!sendResult.ok) {
    const errorMessage = parseRpcErrorMessage(sendResult.error);
    return buildSubmitErrorResult({
      submit_time,
      rpcUrlsUsed: pool.getUsedUrls(),
      signature: 'UNKNOWN',
      errorMessage,
      classificationOverride: mapSubmitErrorClassification(errorMessage),
    });
  }

  const submitAcceptedAtMs = Date.now() - submitStartMs;

  return traceLoop({
    signature: sendResult.value,
    rpcUrls: input.rpcUrls,
    timeoutMs,
    quorumK: input.quorumK,
    maxRpcsPerTick: input.maxRpcsPerTick,
    perTickTimeoutMs: input.perTickTimeoutMs,
    submitStartMs,
    submitAcceptedAtMs,
  });
}

type TraceLoopInput = {
  signature: string;
  rpcUrls: string[];
  timeoutMs: number;
  quorumK?: number;
  maxRpcsPerTick?: number;
  perTickTimeoutMs?: number;
  submitStartMs?: number;
  submitAcceptedAtMs?: number;
};

async function traceLoop(input: TraceLoopInput): Promise<TraceResult> {
  const { signature, rpcUrls, timeoutMs } = input;
  const quorumK = input.quorumK ?? DEFAULT_QUORUM_K;
  const maxRpcsPerTick = input.maxRpcsPerTick ?? DEFAULT_MAX_RPCS_PER_TICK;
  const perTickTimeoutMs = input.perTickTimeoutMs ?? 1_200;
  const pool = new RpcPool(rpcUrls);
  const submit_time = new Date().toISOString();
  const startMs = input.submitStartMs ?? Date.now();
  const observed_status: TimelineEvent[] = [];
  const evidence: TraceEvidence = {
    rpcUrlsUsed: [],
    rpcDisagreement: false,
    perRpc: [],
  };

  let lastStatus: SignatureStatus | null = null;
  let lastStatusName: string | null = null;
  let lastBlockHeight: number | undefined;
  let lastBlockhashRefresh = 0;
  let lastBlockHeightRefresh = 0;

  const deadline = startMs + timeoutMs;

  while (Date.now() < deadline) {
    const perRpcObservations = await pollRpcObservations(
      rpcUrls,
      signature,
      maxRpcsPerTick,
      perTickTimeoutMs,
    );
    evidence.perRpc = perRpcObservations;
    evidence.rpcUrlsUsed = perRpcObservations.map((entry) => entry.rpcUrl);

    const selection = selectQuorumObservation(perRpcObservations, quorumK);
    evidence.rpcDisagreement = selection.rpcDisagreement;
    evidence.selected = selection.selected;

    if (selection.selected?.confirmationStatus) {
      lastStatus = {
        confirmationStatus: selection.selected.confirmationStatus,
        err: selection.selected.err ?? null,
        slot: selection.selected.slot ?? null,
      } as SignatureStatus;
      evidence.confirmationStatus = selection.selected.confirmationStatus;
      evidence.slot = selection.selected.slot;
      evidence.err = selection.selected.err;
      evidence.rpcUrl = selection.selected.rpcUrl;
      evidence.blockTime = selection.selected.blockTime;
      evidence.logsSnippet = selection.selected.logsSnippet;

      if (selection.selected.confirmationStatus !== lastStatusName) {
        observed_status.push({
          status: selection.selected.confirmationStatus,
          slot: selection.selected.slot,
          observedAtMs: Date.now() - startMs,
          rpcUrl: selection.selected.rpcUrl,
        });
        lastStatusName = selection.selected.confirmationStatus;
      }
    }

    if (lastStatus?.err != null && !evidence.logsSnippet) {
      await hydrateErrorEvidence(signature, rpcUrls, evidence, maxRpcsPerTick);
    }

    const now = Date.now();
    if (now - lastBlockHeightRefresh >= BLOCKHEIGHT_REFRESH_MS) {
      const heightResult = await pool.call((conn) => conn.getBlockHeight());
      if (heightResult.ok) {
        lastBlockHeight = heightResult.value;
      }
      lastBlockHeightRefresh = now;
    }

    if (now - lastBlockhashRefresh >= BLOCKHASH_REFRESH_MS) {
      const blockhashResult = await pool.call((conn) => conn.getLatestBlockhash());
      if (blockhashResult.ok) {
        evidence.lastValidBlockHeight = blockhashResult.value.lastValidBlockHeight;
      }
      lastBlockhashRefresh = now;
    }

    if (lastStatus?.confirmationStatus === 'finalized' && lastStatus.err == null) {
      break;
    }

    if (lastStatus?.err != null) {
      break;
    }

    await delay(POLL_INTERVAL_MS);
  }

  const observedDurationMs = Date.now() - startMs;
  const errors = pool.getErrors().map((entry) => entry.message);
  const classificationResult = classify({
    selected: evidence.selected,
    err: evidence.selected?.err ?? evidence.err,
    timeline: observed_status,
    evidence,
    rpcErrors: errors,
    observedDurationMs,
    currentBlockHeight: lastBlockHeight,
    pendingThresholdMs: PENDING_THRESHOLD_MS,
  });

  if (classificationResult.error && !evidence.err) {
    evidence.err = classificationResult.error;
  }

  return {
    signature,
    submit_time,
    rpc_used: pool.getUsedUrls(),
    observed_status,
    phase_graph: buildPhaseGraph({
      observed_status,
      evidence,
      submitAccepted: input.submitAcceptedAtMs != null,
      submitAcceptedAtMs: input.submitAcceptedAtMs,
    }),
    error: classificationResult.error,
    classification: classificationResult.classification,
    evidence,
  };
}

async function pollRpcObservations(
  rpcUrls: string[],
  signature: string,
  maxRpcsPerTick = DEFAULT_MAX_RPCS_PER_TICK,
  perTickTimeoutMs = 1_200,
): Promise<PerRpcObservation[]> {
  const urls = rpcUrls.slice(0, maxRpcsPerTick);
  const statusResults = await callParallel(
    urls,
    (conn) => conn.getSignatureStatuses([signature], { searchTransactionHistory: true }),
    perTickTimeoutMs,
  );

  const perRpc: PerRpcObservation[] = [];
  const transactionRequests: Array<Promise<PerRpcObservation | null>> = [];

  statusResults.forEach((result) => {
    if (!result.ok) {
      perRpc.push({ rpcUrl: result.rpcUrl, rpcError: parseRpcErrorMessage(result.error) });
      return;
    }
    const status = result.value.value[0] ?? null;
    if (status) {
      const observation: PerRpcObservation = {
        rpcUrl: result.rpcUrl,
        confirmationStatus: status.confirmationStatus ?? undefined,
        slot: status.slot ?? undefined,
        err: status.err ?? undefined,
      };
      perRpc.push(observation);
      if (status.err != null) {
        transactionRequests.push(fetchTransactionEvidence(result.rpcUrl, signature));
      }
    } else {
      perRpc.push({ rpcUrl: result.rpcUrl });
    }
  });

  const txEvidence = await Promise.all(transactionRequests);
  txEvidence.forEach((entry) => {
    if (!entry) {
      return;
    }
    const index = perRpc.findIndex((obs) => obs.rpcUrl === entry.rpcUrl);
    if (index >= 0) {
      perRpc[index] = { ...perRpc[index], ...entry };
    }
  });

  return perRpc;
}

function selectQuorumObservation(
  observations: PerRpcObservation[],
  quorumK: number,
): {
  selected?: PerRpcObservation;
  rpcDisagreement: boolean;
} {
  if (observations.length === 0) {
    return { selected: undefined, rpcDisagreement: false };
  }

  const validObservations = observations.filter((obs) => !obs.rpcError);

  if (validObservations.length <= 1) {
    return { selected: validObservations[0] ?? observations[0], rpcDisagreement: false };
  }

  const groupCounts = new Map<string, { count: number; best: PerRpcObservation }>();
  validObservations.forEach((obs) => {
    const key = `${obs.confirmationStatus ?? 'null'}:${obs.slot ?? 'null'}`;
    const existing = groupCounts.get(key);
    if (!existing) {
      groupCounts.set(key, { count: 1, best: obs });
      return;
    }
    existing.count += 1;
    if (statusRank(obs) > statusRank(existing.best)) {
      existing.best = obs;
    }
  });

  const effectiveQuorum = Math.min(quorumK, validObservations.length);
  const quorumGroups = Array.from(groupCounts.values()).filter(
    (group) => group.count >= effectiveQuorum,
  );
  if (quorumGroups.length > 0) {
    quorumGroups.sort((a, b) => statusRank(b.best) - statusRank(a.best));
    return { selected: quorumGroups[0].best, rpcDisagreement: false };
  }

  const ranked = [...validObservations].sort((a, b) => statusRank(b) - statusRank(a));
  return { selected: ranked[0], rpcDisagreement: true };
}

function statusRank(observation: PerRpcObservation): number {
  switch (observation.confirmationStatus) {
    case 'finalized':
      return 3;
    case 'confirmed':
      return 2;
    case 'processed':
      return 1;
    default:
      return 0;
  }
}

async function fetchTransactionEvidence(
  rpcUrl: string,
  signature: string,
): Promise<PerRpcObservation | null> {
  const conn = new Connection(rpcUrl, { commitment: 'processed', disableRetryOnRateLimit: true });
  try {
    const tx = await conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx) {
      return { rpcUrl };
    }
    return buildObservationFromTransaction(tx, rpcUrl);
  } catch {
    return { rpcUrl };
  }
}

async function hydrateErrorEvidence(
  signature: string,
  rpcUrls: string[],
  evidence: TraceEvidence,
  maxRpcsPerTick: number,
): Promise<void> {
  const txResults = await callParallel(rpcUrls.slice(0, maxRpcsPerTick), (conn) =>
    conn.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }),
  );

  txResults.forEach((result) => {
    if (!result.ok || !result.value) {
      return;
    }
    const observation = buildObservationFromTransaction(result.value, result.rpcUrl);
    if (observation.logsSnippet && !evidence.logsSnippet) {
      evidence.logsSnippet = observation.logsSnippet;
    }
    if (observation.blockTime != null && evidence.blockTime == null) {
      evidence.blockTime = observation.blockTime;
    }
  });
}

function buildObservationFromTransaction(
  tx: TransactionResponse | VersionedTransactionResponse,
  rpcUrl: string,
): PerRpcObservation {
  const logs = tx.meta?.logMessages ?? null;
  return {
    rpcUrl,
    confirmationStatus: 'confirmed',
    slot: tx.slot ?? undefined,
    err: tx.meta?.err ?? undefined,
    blockTime: tx.blockTime ?? undefined,
    logsSnippet: logs && logs.length > 0 ? logs.slice(0, 6).join('\n') : undefined,
  };
}

function buildSubmitErrorResult(args: {
  submit_time: string;
  rpcUrlsUsed: string[];
  signature: string;
  errorMessage: string;
  classificationOverride: TraceResult['classification'];
}): TraceResult {
  return {
    signature: args.signature,
    submit_time: args.submit_time,
    rpc_used: args.rpcUrlsUsed,
    observed_status: [],
    phase_graph: buildPhaseGraph({
      observed_status: [],
      evidence: {
        err: args.errorMessage,
        rpcUrlsUsed: args.rpcUrlsUsed,
        rpcDisagreement: false,
        perRpc: [],
      },
      submitAccepted: false,
    }),
    error: args.errorMessage,
    classification: args.classificationOverride,
    evidence: {
      err: args.errorMessage,
      rpcUrlsUsed: args.rpcUrlsUsed,
      rpcDisagreement: false,
      perRpc: [],
      selected: undefined,
    },
  };
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

export function decodeBase64Transaction(rawBase64: string): Buffer {
  return Buffer.from(rawBase64, 'base64');
}

export function mapSubmitErrorClassification(
  message: string,
): TraceResult['classification'] {
  if (isBlockhashNotFoundMessage(message)) {
    return 'BLOCKHASH_EXPIRED';
  }
  if (isRpcRejectMessage(message)) {
    return 'RPC_REJECT';
  }
  return 'RPC_REJECT';
}

function buildPhaseGraph(input: {
  observed_status: TimelineEvent[];
  evidence: TraceEvidence;
  submitAccepted: boolean;
  submitAcceptedAtMs?: number;
}): PhaseEdge[] {
  const edges: PhaseEdge[] = [];
  const source = phaseSource(input.evidence);
  const confidence = phaseConfidence(input.evidence);

  const submitEdgeAt = 0;
  if (input.submitAccepted) {
    edges.push({
      from: 'SUBMIT',
      to: 'RPC_ACCEPTED',
      timestampMs: input.submitAcceptedAtMs ?? submitEdgeAt,
      source,
      confidence,
    });
  }

  const propagatedAt = firstStatusAt(input.observed_status);
  if (propagatedAt != null) {
    edges.push({
      from: input.submitAccepted ? 'RPC_ACCEPTED' : 'SUBMIT',
      to: 'PROPAGATED',
      timestampMs: propagatedAt,
      source,
      confidence,
    });
  }

  const processedAt = statusAt(input.observed_status, 'processed');
  if (processedAt != null) {
    edges.push({
      from: 'PROPAGATED',
      to: 'LEADER_RECEIVED',
      timestampMs: processedAt,
      source,
      confidence,
    });
  }

  const executedAt = executionAt(input);
  if (executedAt != null) {
    edges.push({
      from: processedAt != null ? 'LEADER_RECEIVED' : 'PROPAGATED',
      to: 'EXECUTED',
      timestampMs: executedAt,
      source,
      confidence,
    });
  }

  const confirmedAt = statusAt(input.observed_status, 'confirmed');
  if (confirmedAt != null) {
    edges.push({
      from: executedAt != null ? 'EXECUTED' : 'PROPAGATED',
      to: 'CONFIRMED',
      timestampMs: confirmedAt,
      source,
      confidence,
    });
  }

  const finalizedAt = statusAt(input.observed_status, 'finalized');
  if (finalizedAt != null) {
    edges.push({
      from: confirmedAt != null ? 'CONFIRMED' : 'PROPAGATED',
      to: 'FINALIZED',
      timestampMs: finalizedAt,
      source,
      confidence,
    });
  }

  return edges;
}

function firstStatusAt(events: TimelineEvent[]): number | null {
  if (events.length === 0) {
    return null;
  }
  return events[0].observedAtMs;
}

function statusAt(
  events: TimelineEvent[],
  status: 'processed' | 'confirmed' | 'finalized',
): number | null {
  const event = events.find((entry) => entry.status === status);
  return event ? event.observedAtMs : null;
}

function executionAt(input: {
  observed_status: TimelineEvent[];
  evidence: TraceEvidence;
}): number | null {
  if (input.evidence.err == null && !input.evidence.logsSnippet) {
    return null;
  }
  const confirmedAt = statusAt(input.observed_status, 'confirmed');
  if (confirmedAt != null) {
    return confirmedAt;
  }
  const processedAt = statusAt(input.observed_status, 'processed');
  if (processedAt != null) {
    return processedAt;
  }
  return firstStatusAt(input.observed_status);
}

function phaseSource(evidence: TraceEvidence): string {
  const rpcUrl = evidence.selected?.rpcUrl ?? evidence.rpcUrl ?? 'unknown';
  if (!evidence.rpcDisagreement && (evidence.perRpc?.length ?? 0) > 1) {
    return 'quorum';
  }
  return `rpc:${rpcUrl}`;
}

function phaseConfidence(evidence: TraceEvidence): number {
  if (!evidence.rpcDisagreement && (evidence.perRpc?.length ?? 0) > 1) {
    return 0.8;
  }
  if ((evidence.perRpc?.length ?? 0) === 1) {
    return 0.6;
  }
  return 0.4;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
