export type TraceClassification =
  | 'RPC_REJECT'
  | 'PREFLIGHT_FAIL'
  | 'BLOCKHASH_EXPIRED'
  | 'NOT_PROPAGATED'
  | 'LEADER_OR_CONGESTION'
  | 'EXECUTION_ERROR'
  | 'FINALIZED_OK';

export type ConfirmationStatus = 'processed' | 'confirmed' | 'finalized';

export type TimelineEvent = {
  status: ConfirmationStatus;
  slot?: number;
  observedAtMs: number;
  rpcUrl?: string;
};

export type TraceEvidence = {
  rpcUrl?: string;
  slot?: number;
  confirmationStatus?: ConfirmationStatus;
  err?: unknown;
  logsSnippet?: string;
  blockTime?: number | null;
  lastValidBlockHeight?: number;
  rpcUrlsUsed?: string[];
  rpcDisagreement?: boolean;
  perRpc?: PerRpcObservation[];
  selected?: PerRpcObservation;
};

export type TraceInput = {
  signature: string;
  rpcUrls: string[];
  timeoutMs?: number;
  quorumK?: number;
  maxRpcsPerTick?: number;
  perTickTimeoutMs?: number;
};

export type TraceResult = {
  signature: string;
  submit_time: string;
  rpc_used: string[];
  observed_status: TimelineEvent[];
  phase_graph: PhaseEdge[];
  error?: string;
  classification: TraceClassification;
  evidence: TraceEvidence;
};

export type Phase = 'SUBMIT' | 'RPC_ACCEPTED' | 'PROPAGATED' | 'LEADER_RECEIVED' | 'EXECUTED' | 'CONFIRMED' | 'FINALIZED';

export type PhaseEdge = {
  from: Phase;
  to: Phase;
  timestampMs: number;
  source: string;
  confidence: number;
};

export type PerRpcObservation = {
  rpcUrl: string;
  confirmationStatus?: ConfirmationStatus;
  slot?: number;
  err?: unknown;
  blockTime?: number | null;
  logsSnippet?: string;
  rpcError?: string;
};

export type SubmitTraceInput = {
  rpcUrls: string[];
  rawTransaction: Buffer;
  skipPreflight?: boolean;
  timeoutMs?: number;
  quorumK?: number;
  maxRpcsPerTick?: number;
  perTickTimeoutMs?: number;
};

export type RpcCallResult<T> =
  | { ok: true; value: T; rpcUrl: string }
  | { ok: false; error: Error; rpcUrl: string };

export type RpcErrorInfo = {
  message: string;
  rpcUrl: string;
};
