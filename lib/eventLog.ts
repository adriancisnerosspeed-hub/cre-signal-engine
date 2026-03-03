/**
 * Structured event logging for SLA/observability. Emit JSON to stdout for key actions.
 * Consumers can pipe to a log aggregator or event bus.
 */

export type EventType =
  | "scan_created"
  | "policy_evaluated"
  | "override_created"
  | "snapshot_built"
  | "cohort_updated"
  | "cohort_created"
  | "api_token_created"
  | "api_token_revoked"
  | "api_v1_call";

export type EventPayload = {
  event: EventType;
  org_id?: string;
  user_id?: string;
  timestamp: string;
  [key: string]: unknown;
};

function emit(payload: EventPayload) {
  const line = JSON.stringify({
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  });
  console.log(line);
}

export function logScanCreated(params: { org_id: string; user_id?: string; deal_id: string; scan_id: string }) {
  emit({ event: "scan_created", ...params, timestamp: new Date().toISOString() });
}

export function logPolicyEvaluated(params: { org_id: string; user_id?: string; policy_id: string }) {
  emit({ event: "policy_evaluated", ...params, timestamp: new Date().toISOString() });
}

export function logOverrideCreated(params: { org_id: string; user_id: string; deal_id: string; policy_id: string }) {
  emit({ event: "override_created", ...params, timestamp: new Date().toISOString() });
}

export function logSnapshotBuilt(params: {
  org_id: string;
  user_id?: string;
  cohort_id: string;
  snapshot_id: string;
  build_status: string;
  n_eligible?: number;
}) {
  emit({ event: "snapshot_built", ...params, timestamp: new Date().toISOString() });
}

export function logCohortCreated(params: { org_id: string; user_id: string; cohort_id: string; key: string }) {
  emit({ event: "cohort_created", ...params, timestamp: new Date().toISOString() });
}

export function logCohortUpdated(params: { org_id: string; user_id: string; cohort_id: string }) {
  emit({ event: "cohort_updated", ...params, timestamp: new Date().toISOString() });
}

export function logApiTokenCreated(params: { org_id: string; user_id: string; token_id: string; name: string }) {
  emit({ event: "api_token_created", ...params, timestamp: new Date().toISOString() });
}

export function logApiTokenRevoked(params: { org_id: string; user_id: string; token_id: string }) {
  emit({ event: "api_token_revoked", ...params, timestamp: new Date().toISOString() });
}

export function logApiV1Call(params: { org_id: string; endpoint: string; token_id?: string }) {
  emit({ event: "api_v1_call", ...params, timestamp: new Date().toISOString() });
}
