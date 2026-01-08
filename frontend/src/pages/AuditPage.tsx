import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listSubmissionsByProject, getSubmissionDetail } from "../api/api";
import type { AuditDetail, Submission } from "../api/types";
import { ErrorBlock } from "../ui/ErrorBlock";
import { JsonTextarea } from "../ui/JsonTextarea";

type Decision = "allow" | "reject" | "need_more" | "error" | string;

type NormalizedError = {
  code?: string;
  path?: string;
  message?: string;
  raw: unknown;
};

/**
 * List item stays tolerant because your Submission type is shared
 * and can be thinner than audit list view fields.
 */
type AuditListItem = Submission & {
  submission_id?: string;
  created_at?: string;
  decision?: Decision;

  gate_id?: string;
  gate_version?: string;
  current_gate_id?: string;
  current_gate_version?: string;

  state_before?: string | null;
  state_after?: string | null;

  // legacy shapes that might exist
  result?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function prettyJson(v: unknown): string {
  if (v === undefined) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function safeDecisionLabel(d: Decision | undefined): string {
  if (!d) return "—";
  return d;
}

function decisionBadgeStyle(decision: Decision | undefined): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #ddd",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  };

  if (!decision) return base;
  if (decision === "reject") return { ...base, borderColor: "#f0c2c2" };
  if (decision === "allow") return { ...base, borderColor: "#cfe3cf" };
  if (decision === "need_more") return { ...base, borderColor: "#e6dfbf" };
  if (decision === "error") return { ...base, borderColor: "#f0c2c2" };
  return base;
}

function parseEpoch(iso?: string): number {
  if (!iso) return Number.NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
}

function sortByCreatedAtDesc<T extends { created_at?: string }>(maybeItems: unknown): T[] {
  if (!Array.isArray(maybeItems)) return [];
  const copy = [...(maybeItems as T[])];
  copy.sort((a, b) => {
    const at = parseEpoch(a.created_at);
    const bt = parseEpoch(b.created_at);
    const aVal = Number.isFinite(at) ? at : -Infinity;
    const bVal = Number.isFinite(bt) ? bt : -Infinity;
    return bVal - aVal;
  });
  return copy;
}

/**
 * Normalize list API response into an array.
 * Supported shapes:
 * - [...]
 * - { items: [...] }
 * - { submissions: [...] }
 * - { data: [...] }
 * - { results: [...] }
 */
function normalizeSubmissionsListResponse(payload: unknown): AuditListItem[] {
  if (Array.isArray(payload)) return payload as AuditListItem[];
  if (!isRecord(payload)) return [];

  const candidates = ["items", "submissions", "data", "results"];
  for (const key of candidates) {
    const v = (payload as any)[key];
    if (Array.isArray(v)) return v as AuditListItem[];
  }

  return [];
}

/**
 * Extract "errors" array from result payload (no interpretation).
 * Stays tolerant because error shapes may vary (loc/msg/etc).
 */
function extractErrorsFromResult(result: unknown): NormalizedError[] {
  if (!isRecord(result)) return [];
  const errors = (result as any).errors;
  if (!Array.isArray(errors)) return [];

  return errors.map((e) => {
    if (isRecord(e)) {
      const code =
        asString((e as any).code) ??
        asString((e as any).error_code) ??
        asString((e as any).errorCode) ??
        asString((e as any).type) ??
        undefined;

      const path =
        asString((e as any).path) ??
        asString((e as any).pointer) ??
        (Array.isArray((e as any).loc) ? (e as any).loc.join(".") : asString((e as any).loc)) ??
        undefined;

      const message =
        asString((e as any).message) ??
        asString((e as any).msg) ??
        asString((e as any).detail) ??
        asString((e as any).reason) ??
        undefined;

      return { code, path, message, raw: e };
    }
    return { raw: e };
  });
}

/**
 * Extract protocol-ish fields from engine-like results.
 * Used only as fallback for header fields (gate/state/decision).
 */
function extractProtocol(result: unknown): {
  decision?: Decision;
  state_before?: string | null;
  state_after?: string | null;
  gate_id?: string | null;
  gate_version?: string | null;
  errors: NormalizedError[];
} {
  if (!isRecord(result)) return { errors: [] };

  const decision = asString((result as any).decision) as Decision | undefined;

  const state_before =
    asString((result as any).project_state) ??
    asString((result as any).state_before) ??
    asString((result as any).stateBefore) ??
    null;

  const state_after =
    asString((result as any).next_state) ??
    asString((result as any).state_after) ??
    asString((result as any).stateAfter) ??
    null;

  const gate_id =
    asString((result as any).gate_id) ??
    asString((result as any).current_gate_id) ??
    asString((result as any).currentGateId) ??
    null;

  const gate_version =
    asString((result as any).gate_version) ??
    asString((result as any).current_gate_version) ??
    asString((result as any).currentGateVersion) ??
    null;

  const errors = extractErrorsFromResult(result);

  return { decision, state_before, state_after, gate_id, gate_version, errors };
}

function Row(props: { label: string; value: React.ReactNode; monospace?: boolean }) {
  const { label, value, monospace } = props;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, alignItems: "baseline" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 12, wordBreak: "break-word", fontFamily: monospace ? "monospace" : undefined }}>{value}</div>
    </div>
  );
}

export function AuditPage() {
  const navigate = useNavigate();
  const params = useParams();

  const projectId: string = (params as any).id || (params as any).projectId || "";
  const submissionId: string = (params as any).submissionId || "";

  const [rawListPayload, setRawListPayload] = useState<unknown>(null);

  const [items, setItems] = useState<AuditListItem[] | null>(null);
  const [listErr, setListErr] = useState<unknown>(null);

  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailErr, setDetailErr] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showRawResult, setShowRawResult] = useState(false);

  async function refreshList() {
    setListErr(null);
    setItems(null);
    setRawListPayload(null);

    try {
      const payload = await listSubmissionsByProject(projectId);
      setRawListPayload(payload);

      const normalized = normalizeSubmissionsListResponse(payload);
      setItems(normalized);
    } catch (e) {
      setListErr(e);
      setItems([]);
    }
  }

  async function refreshDetail() {
    if (!submissionId) return;

    setDetailErr(null);
    setDetailLoading(true);
    try {
      const d = await getSubmissionDetail(submissionId);
      setDetail(d);
    } catch (e) {
      setDetailErr(e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    setShowRawResult(false);
    setDetail(null);
    setDetailErr(null);

    if (!submissionId) return;
    refreshDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const sortedItems = useMemo(() => {
    return sortByCreatedAtDesc<AuditListItem>(items);
  }, [items]);

  function normalizeListRow(s: AuditListItem): {
    created_at?: string;
    decision?: Decision;
    gate_id?: string;
    gate_version?: string;
    state_before?: string | null;
    state_after?: string | null;
    submission_id?: string;
  } {
    const decision = (s.decision as Decision | undefined) ?? undefined;

    const gate_id = s.gate_id ?? s.current_gate_id ?? undefined;
    const gate_version = s.gate_version ?? s.current_gate_version ?? undefined;

    const proto = extractProtocol((s as any).result);

    const state_before = (s.state_before ?? proto.state_before) ?? null;
    const state_after = (s.state_after ?? proto.state_after) ?? null;

    return {
      created_at: s.created_at ?? undefined,
      decision,
      gate_id,
      gate_version,
      state_before,
      state_after,
      submission_id: s.submission_id ?? undefined,
    };
  }

  // CANON: strict locations for request/result/immutability
  const detailRequest = useMemo(() => {
    return detail?.request;
  }, [detail]);

  const detailResult = useMemo(() => {
    return detail?.result;
  }, [detail]);

  const detailArtifacts = useMemo(() => {
    return detail?.request?.artifacts;
  }, [detail]);

  // Header protocol fields: prefer top-level, fallback to result-derived
  const detailProtocol = useMemo(() => {
    const proto = extractProtocol(detailResult);

    const gate_id = (detail?.gate_id ?? proto.gate_id) ?? undefined;
    const gate_version = (detail?.gate_version ?? proto.gate_version) ?? undefined;

    const state_before = (detail?.state_before ?? proto.state_before) ?? undefined;
    const state_after = (detail?.state_after ?? proto.state_after) ?? undefined;

    const decision = (detailResult as any)?.decision ?? detail?.result?.decision ?? detail?.result?.decision ?? proto.decision;

    const errors = extractErrorsFromResult(detailResult);

    return { decision: decision as Decision | undefined, gate_id, gate_version, state_before, state_after, errors };
  }, [detail, detailResult]);

  const backToProjectHref = `/projects/${projectId}`;
  const backToAuditListHref = `/projects/${projectId}/audit`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Audit</div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Project: <span style={{ fontFamily: "monospace" }}>{projectId || "—"}</span>
          </div>

          {submissionId ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Submission: <span style={{ fontFamily: "monospace" }}>{submissionId}</span>
            </div>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            <Link to={backToProjectHref}>← back to project</Link>
          </div>

          {submissionId ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              <Link to={backToAuditListHref}>← back to audit list</Link>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {submissionId ? (
            <button
              onClick={refreshDetail}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
            >
              Refresh detail
            </button>
          ) : (
            <button
              onClick={refreshList}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
            >
              Refresh list
            </button>
          )}
        </div>
      </div>

      {/* Errors */}
      {listErr ? <ErrorBlock title="audit list error" error={listErr} /> : null}
      {detailErr ? <ErrorBlock title="audit detail error" error={detailErr} /> : null}

      {/* LIST VIEW */}
      {!submissionId ? (
        <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Submissions</div>

          {items === null ? (
            <div>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No submissions yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      created_at
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      decision
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      gate_id
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      gate_version
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      state_before
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      state_after
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      submission_id
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedItems.map((s, idx) => {
                    const row = normalizeListRow(s);
                    const sid = row.submission_id ?? `row-${idx}`;

                    return (
                      <tr key={sid}>
                        <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 4px", whiteSpace: "nowrap" }}>
                          {row.created_at ?? "—"}
                        </td>

                        <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 4px", whiteSpace: "nowrap" }}>
                          <span style={decisionBadgeStyle(row.decision)}>{safeDecisionLabel(row.decision)}</span>
                        </td>

                        <td
                          style={{
                            borderBottom: "1px solid #f2f2f2",
                            padding: "6px 4px",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.gate_id ?? "—"}
                        </td>

                        <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 4px", whiteSpace: "nowrap" }}>
                          {row.gate_version ?? "—"}
                        </td>

                        <td
                          style={{
                            borderBottom: "1px solid #f2f2f2",
                            padding: "6px 4px",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.state_before ?? "—"}
                        </td>

                        <td
                          style={{
                            borderBottom: "1px solid #f2f2f2",
                            padding: "6px 4px",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.state_after ?? "—"}
                        </td>

                        <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 4px", fontFamily: "monospace" }}>
                          {row.submission_id ? (
                            <a
                              href={`${backToAuditListHref}/${encodeURIComponent(row.submission_id)}`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`${backToAuditListHref}/${encodeURIComponent(row.submission_id!)}`);
                              }}
                            >
                              {row.submission_id}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Show raw list response</summary>
                <div style={{ marginTop: 8 }}>
                  <JsonTextarea label="raw list payload" value={prettyJson(rawListPayload)} readOnly />
                </div>
              </details>
            </div>
          )}
        </section>
      ) : null}

      {/* DETAIL VIEW */}
      {submissionId ? (
        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Immutable snapshot</div>

            {detailLoading ? (
              <div>Loading…</div>
            ) : !detail ? (
              <div style={{ opacity: 0.7 }}>No detail loaded.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <Row label="submission_id" value={detail.submission_id ?? submissionId} monospace />
                <Row label="created_at" value={detail.created_at ?? "—"} />
                <Row
                  label="decision"
                  value={
                    <span style={decisionBadgeStyle(detailProtocol.decision)}>{safeDecisionLabel(detailProtocol.decision)}</span>
                  }
                />
                <Row label="gate_id" value={detailProtocol.gate_id ?? "—"} monospace />
                <Row label="gate_version" value={detailProtocol.gate_version ?? "—"} />
                <Row label="state_before" value={detailProtocol.state_before ?? "—"} monospace />
                <Row label="state_after" value={detailProtocol.state_after ?? "—"} monospace />

                <div style={{ marginTop: 10, borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                  <JsonTextarea label="immutability" value={prettyJson(detail.immutability)} readOnly />
                </div>
              </div>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>What was sent</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>request.artifacts</div>

              {detailLoading ? <div>Loading…</div> : <JsonTextarea label="artifacts" value={prettyJson(detailArtifacts)} readOnly />}
            </section>

            <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>What engine returned</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>result (decision, errors, meta)</div>

              {detailLoading ? (
                <div>Loading…</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <Row
                    label="decision"
                    value={
                      <span style={decisionBadgeStyle(detailProtocol.decision)}>{safeDecisionLabel(detailProtocol.decision)}</span>
                    }
                  />

                  <div style={{ borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12 }}>Errors</div>

                    {detailProtocol.errors.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {detailProtocol.errors.map((e, i) => (
                          <div
                            key={i}
                            style={{
                              border: "1px solid #f2f2f2",
                              borderRadius: 8,
                              padding: 8,
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12 }}>{e.code ?? "—"}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>{e.path ?? "—"}</span>
                            </div>
                            {e.message ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{e.message}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>—</div>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                    <button
                      onClick={() => setShowRawResult((v) => !v)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        cursor: "pointer",
                        background: showRawResult ? "#fafafa" : "#fff",
                      }}
                    >
                      {showRawResult ? "Hide raw result" : "Show raw result"}
                    </button>

                    {showRawResult ? (
                      <div style={{ marginTop: 10 }}>
                        <JsonTextarea label="raw result" value={prettyJson(detailResult)} readOnly />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Protocol snapshots (raw)</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>As-is. No interpretation.</div>

            {detailLoading ? (
              <div>Loading…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ border: "1px solid #f2f2f2", borderRadius: 10, padding: 10, minWidth: 0 }}>
                  <JsonTextarea label="raw request" value={prettyJson(detailRequest)} readOnly />
                </div>

                <div style={{ border: "1px solid #f2f2f2", borderRadius: 10, padding: 10, minWidth: 0 }}>
                  <JsonTextarea label="raw result" value={prettyJson(detailResult)} readOnly />
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

