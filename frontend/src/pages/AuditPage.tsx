import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listSubmissionsByProject, getSubmissionDetail } from "../api/api";
import type { Submission } from "../api/types";
import { ErrorBlock } from "../ui/ErrorBlock";
import { JsonTextarea } from "../ui/JsonTextarea";
import { UI_TEXT_RU } from "../canon/uiText.ru";
import type { Decision } from "../canon/protocol.ru";
import { decisionTitleRu, decisionHintRu } from "../canon/protocol.ru";

type NormalizedError = {
  code?: string;
  path?: string;
  message?: string;
  raw: unknown;
};

/**
 * We keep it tolerant because your existing `Submission` type
 * might not include audit-specific list fields yet.
 */
type AuditListItem = Submission & {
  submission_id?: string;
  created_at?: string;
  decision?: Decision;

  gate_id?: string;
  gate_version?: string;
  current_gate_id?: string;
  current_gate_version?: string;

  state_before?: string;
  state_after?: string;

  // legacy shapes that might exist
  result?: unknown;
};

type AuditDetail = {
  submission_id?: string;
  created_at?: string;

  // explicit immutability block (preferred)
  immutability?: unknown;

  request?: unknown;
  result?: unknown;

  // alternate / legacy keys
  payload?: unknown;
  response?: unknown;
  output?: unknown;

  decision?: Decision;
  gate_id?: string;
  gate_version?: string;
  current_gate_id?: string;
  current_gate_version?: string;
  state_before?: string;
  state_after?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function prettyJson(v: unknown): string {
  if (v === undefined) return UI_TEXT_RU.common.dash;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function safeDecisionLabel(d: Decision | undefined): string {
  if (!d) return UI_TEXT_RU.common.dash;
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

/**
 * IMPORTANT: guard against non-array inputs.
 */
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
 */
function extractProtocol(result: unknown): {
  decision?: Decision;
  state_before?: string;
  state_after?: string;
  gate_id?: string;
  gate_version?: string;
  errors: NormalizedError[];
} {
  if (!isRecord(result)) return { errors: [] };

  const decision = asString((result as any).decision) as Decision | undefined;

  const state_before =
    asString((result as any).project_state) ??
    asString((result as any).state_before) ??
    asString((result as any).stateBefore);

  const state_after =
    asString((result as any).next_state) ??
    asString((result as any).state_after) ??
    asString((result as any).stateAfter);

  const gate_id =
    asString((result as any).gate_id) ??
    asString((result as any).current_gate_id) ??
    asString((result as any).currentGateId);

  const gate_version =
    asString((result as any).gate_version) ??
    asString((result as any).current_gate_version) ??
    asString((result as any).currentGateVersion);

  const errors = extractErrorsFromResult(result);

  return { decision, state_before, state_after, gate_id, gate_version, errors };
}

/**
 * Extract artifacts snapshot from request/payload shapes (tolerant).
 */
function extractArtifactsSnapshot(container: unknown): unknown | undefined {
  if (!isRecord(container)) return undefined;

  // preferred: request.artifacts
  if ("request" in container && isRecord((container as any).request)) {
    const req = (container as any).request;
    if (isRecord(req) && "artifacts" in req) return (req as any).artifacts;
  }

  // common: artifacts at top level
  if ("artifacts" in container) return (container as any).artifacts;

  // common: payload.input.artifacts
  if ("input" in container && isRecord((container as any).input)) {
    const input = (container as any).input;
    if (isRecord(input) && "artifacts" in input) return (input as any).artifacts;
  }

  return undefined;
}

function Row(props: { label: string; value: React.ReactNode; monospace?: boolean }) {
  const { label, value, monospace } = props;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, alignItems: "baseline" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 12, wordBreak: "break-word", fontFamily: monospace ? "monospace" : undefined }}>
        {value}
      </div>
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
      const d = (await getSubmissionDetail(submissionId)) as AuditDetail;
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
    state_before?: string;
    state_after?: string;
    submission_id?: string;
  } {
    const decision = (s.decision as Decision | undefined) ?? undefined;

    const gate_id = s.gate_id ?? s.current_gate_id ?? undefined;
    const gate_version = s.gate_version ?? s.current_gate_version ?? undefined;

    const proto = extractProtocol((s as any).result);

    const state_before = s.state_before ?? proto.state_before ?? undefined;
    const state_after = s.state_after ?? proto.state_after ?? undefined;

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

  const detailRequest = useMemo(() => {
    if (!detail) return undefined;
    if (detail.request !== undefined) return detail.request;
    if (detail.payload !== undefined) return detail.payload;
    return undefined;
  }, [detail]);

  const detailResult = useMemo(() => {
    if (!detail) return undefined;
    if (detail.result !== undefined) return detail.result;
    if (detail.response !== undefined) return detail.response;
    if (detail.output !== undefined) return detail.output;
    return undefined;
  }, [detail]);

  const detailArtifacts = useMemo(() => {
    const fromReq = extractArtifactsSnapshot({ request: detailRequest });
    if (fromReq !== undefined) return fromReq;
    return extractArtifactsSnapshot(detailRequest);
  }, [detailRequest]);

  const detailProtocol = useMemo(() => {
    const proto = extractProtocol(detailResult);

    const gate_id = detail?.gate_id ?? detail?.current_gate_id ?? proto.gate_id;
    const gate_version = detail?.gate_version ?? detail?.current_gate_version ?? proto.gate_version;

    const state_before = detail?.state_before ?? proto.state_before;
    const state_after = detail?.state_after ?? proto.state_after;

    const decision = (detail?.decision ?? proto.decision) as Decision | undefined;

    return { decision, gate_id, gate_version, state_before, state_after, errors: proto.errors };
  }, [detail, detailResult]);

  const backToProjectHref = `/projects/${projectId}`;
  const backToAuditListHref = `/projects/${projectId}/audit`;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{UI_TEXT_RU.audit.title}</div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {UI_TEXT_RU.audit.header.project}:{" "}
            <span style={{ fontFamily: "monospace" }}>{projectId || UI_TEXT_RU.common.dash}</span>
          </div>

          {submissionId ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {UI_TEXT_RU.audit.header.submission}:{" "}
              <span style={{ fontFamily: "monospace" }}>{submissionId}</span>
            </div>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            <Link to={backToProjectHref}>{UI_TEXT_RU.audit.links.backToProject}</Link>
          </div>

          {submissionId ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              <Link to={backToAuditListHref}>{UI_TEXT_RU.audit.links.backToList}</Link>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {submissionId ? (
            <button
              onClick={refreshDetail}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
            >
              {UI_TEXT_RU.common.refreshDetail}
            </button>
          ) : (
            <button
              onClick={refreshList}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
            >
              {UI_TEXT_RU.common.refreshList}
            </button>
          )}
        </div>
      </div>

      {/* Errors */}
      {listErr ? <ErrorBlock title={UI_TEXT_RU.audit.errors.listError} error={listErr} /> : null}
      {detailErr ? <ErrorBlock title={UI_TEXT_RU.audit.errors.detailError} error={detailErr} /> : null}

      {/* LIST VIEW */}
      {!submissionId ? (
        <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{UI_TEXT_RU.audit.list.title}</div>

          {items === null ? (
            <div>{UI_TEXT_RU.common.loading}</div>
          ) : items.length === 0 ? (
            <div style={{ opacity: 0.7 }}>{UI_TEXT_RU.audit.list.empty}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.createdAt}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.decision}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.gateId}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.gateVersion}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.stateBefore}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.stateAfter}
                    </th>
                    <th align="left" style={{ borderBottom: "1px solid #ddd", padding: "6px 4px" }}>
                      {UI_TEXT_RU.audit.list.table.submissionId}
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
                          {row.created_at ?? UI_TEXT_RU.common.dash}
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
                          {row.gate_id ?? UI_TEXT_RU.common.dash}
                        </td>

                        <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 4px", whiteSpace: "nowrap" }}>
                          {row.gate_version ?? UI_TEXT_RU.common.dash}
                        </td>

                        <td
                          style={{
                            borderBottom: "1px solid #f2f2f2",
                            padding: "6px 4px",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.state_before ?? UI_TEXT_RU.common.dash}
                        </td>

                        <td
                          style={{
                            borderBottom: "1px solid #f2f2f2",
                            padding: "6px 4px",
                            whiteSpace: "nowrap",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.state_after ?? UI_TEXT_RU.common.dash}
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
                            UI_TEXT_RU.common.dash
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>
                  {UI_TEXT_RU.audit.list.rawList.summary}
                </summary>
                <div style={{ marginTop: 8 }}>
                  <JsonTextarea label={UI_TEXT_RU.audit.list.rawList.label} value={prettyJson(rawListPayload)} readOnly />
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
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{UI_TEXT_RU.audit.detail.sections.snapshot}</div>

            {detailLoading ? (
              <div>{UI_TEXT_RU.common.loading}</div>
            ) : !detail ? (
              <div style={{ opacity: 0.7 }}>{UI_TEXT_RU.audit.detail.loadingEmpty}</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <Row
                  label={UI_TEXT_RU.decision.fields.submission}
                  value={detail.submission_id ?? submissionId}
                  monospace
                />
                <Row label={UI_TEXT_RU.audit.list.table.createdAt} value={detail.created_at ?? UI_TEXT_RU.common.dash} />
                <Row
                  label={UI_TEXT_RU.decision.fields.decision}
                  value={
                    <span style={decisionBadgeStyle(detailProtocol.decision)}>
                      {safeDecisionLabel(detailProtocol.decision)}
                    </span>
                  }
                />
                <Row label={UI_TEXT_RU.decision.fields.gate} value={detailProtocol.gate_id ?? UI_TEXT_RU.common.dash} monospace />
                <Row label={UI_TEXT_RU.decision.fields.canon} value={detailProtocol.gate_version ?? UI_TEXT_RU.common.dash} />
                <Row label={UI_TEXT_RU.decision.fields.stateBefore} value={detailProtocol.state_before ?? UI_TEXT_RU.common.dash} monospace />
                <Row label={UI_TEXT_RU.decision.fields.stateAfter} value={detailProtocol.state_after ?? UI_TEXT_RU.common.dash} monospace />

                <div style={{ marginTop: 8, borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>
                    {decisionTitleRu(detailProtocol.decision)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    {decisionHintRu(detailProtocol.decision)}
                  </div>
                </div>

                {detail.immutability !== undefined ? (
                  <div style={{ marginTop: 10, borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                    <JsonTextarea label={UI_TEXT_RU.audit.detail.immutability} value={prettyJson(detail.immutability)} readOnly />
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{UI_TEXT_RU.audit.detail.sections.sent}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>{UI_TEXT_RU.audit.detail.sentHint}</div>

              {detailLoading ? (
                <div>{UI_TEXT_RU.common.loading}</div>
              ) : (
                <JsonTextarea label={UI_TEXT_RU.audit.detail.artifacts} value={prettyJson(detailArtifacts)} readOnly />
              )}
            </section>

            <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{UI_TEXT_RU.audit.detail.sections.returned}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>{UI_TEXT_RU.audit.detail.returnedHint}</div>

              {detailLoading ? (
                <div>{UI_TEXT_RU.common.loading}</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <Row
                    label={UI_TEXT_RU.decision.fields.decision}
                    value={
                      <span style={decisionBadgeStyle(detailProtocol.decision)}>
                        {safeDecisionLabel(detailProtocol.decision)}
                      </span>
                    }
                  />

                  <div style={{ borderTop: "1px solid #f2f2f2", paddingTop: 10 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12 }}>{UI_TEXT_RU.decision.errors.title}</div>

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
                              <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12 }}>
                                {e.code ?? UI_TEXT_RU.common.dash}
                              </span>
                              <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>
                                {e.path ?? UI_TEXT_RU.common.dash}
                              </span>
                            </div>
                            {e.message ? (
                              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{e.message}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{UI_TEXT_RU.decision.errors.empty}</div>
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
                      {showRawResult ? UI_TEXT_RU.decision.raw.hide : UI_TEXT_RU.decision.raw.show}
                    </button>

                    {showRawResult ? (
                      <div style={{ marginTop: 10 }}>
                        <JsonTextarea label={UI_TEXT_RU.audit.detail.rawResult} value={prettyJson(detailResult)} readOnly />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{UI_TEXT_RU.audit.detail.sections.rawSnapshots}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>{UI_TEXT_RU.audit.detail.rawSnapshotsHint}</div>

            {detailLoading ? (
              <div>{UI_TEXT_RU.common.loading}</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ border: "1px solid #f2f2f2", borderRadius: 10, padding: 10, minWidth: 0 }}>
                  <JsonTextarea label={UI_TEXT_RU.audit.detail.rawRequest} value={prettyJson(detailRequest)} readOnly />
                </div>

                <div style={{ border: "1px solid #f2f2f2", borderRadius: 10, padding: 10, minWidth: 0 }}>
                  <JsonTextarea label={UI_TEXT_RU.audit.detail.rawResult} value={prettyJson(detailResult)} readOnly />
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
