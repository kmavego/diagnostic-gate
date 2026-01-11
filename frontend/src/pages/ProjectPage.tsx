import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { evaluateProject, getUiSchema, getUiSchemaV1 } from "../api/api";
import type { EvaluateResponse, UiSchemaResponse } from "../api/types";
import { JsonTextarea } from "../ui/JsonTextarea";
import { ErrorBlock } from "../ui/ErrorBlock";
import { getModeFromSearch } from "../app/mode";
import { FormRendererV1 } from "../ui/FormRendererV1";
import { extractArtifacts } from "../ui/formState";

const ARTIFACTS_TEMPLATE = {
  scenario: {
    actor: "",
    wrong_action: "",
    consequence: "",
  },
  cost_of_error: {
    amount: 0,
    currency: "RUB",
    rationale: "",
  },
  evidence: [],
};

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: "artifacts must be a JSON object" };
    }
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: (e as any)?.message ?? "invalid JSON" };
  }
}

function decisionBadge(decision: string) {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid #ddd",
  };
  return <span style={base}>{decision}</span>;
}

function decisionText(decision: string) {
  switch (decision) {
    case "allow":
      return { title: "Допуск получен", text: "Гейт пройден. Можно переходить дальше." };
    case "need_more":
      return { title: "Недостаточно данных", text: "Недостаточно данных для принятия решения." };
    case "reject":
      return { title: "Запрет", text: "Проект не допускается. Ниже указаны причины." };
    case "error":
      return { title: "Ошибка", text: "Во время проверки произошла ошибка." };
    default:
      return { title: "Решение", text: "" };
  }
}

function normalizePathKey(p: any): string {
  // Keep backward-compat with older backend ("artifacts") and new ("/artifacts")
  const s = String(p ?? "").trim();
  if (!s) return "";

  // "/artifacts/target_action" -> "artifacts.target_action"
  if (s.startsWith("/")) {
    const noSlash = s.slice(1);
    return noSlash.replaceAll("/", ".");
  }

  // "artifacts.target_action" already ok
  return s;
}

export function ProjectPage() {
  const location = useLocation();
  const mode = getModeFromSearch(location.search);
  const isAudit = mode === "audit";

  const { id } = useParams();
  const projectId = id || "";

  // UI schema (нужна в product и audit)
  const [ui, setUi] = useState<UiSchemaResponse | null>(null);
  const [uiErr, setUiErr] = useState<unknown>(null);

  // product: состояние формы (держим как { artifacts: ... })
  const [formState, setFormState] = useState<any>({ artifacts: {} });

  // audit: raw JSON
  const [artifactsText, setArtifactsText] = useState<string>("{}");
  const parsed = useMemo(() => safeParseJson(artifactsText), [artifactsText]);

  const [evalBusy, setEvalBusy] = useState(false);
  const [evalErr, setEvalErr] = useState<unknown>(null);
  const [evalRes, setEvalRes] = useState<EvaluateResponse | null>(null);

  /**
   * Product mode: field-level errors map (ui_field_id -> messages[])
   * Source: EvaluateResponse.errors[*].meta.ui_field_id / ui_field_ids
   */
    const productFieldErrorsById = useMemo(() => {
      const map: Record<string, string[]> = {};
      if (!evalRes?.errors) return map;

      for (const e of evalRes.errors as any[]) {
        const meta = e?.meta;
        const msg = (e?.message || "").trim();
        if (!msg || !meta) continue;

        // 1. одиночное поле
        if (meta.ui_field_id) {
          map[meta.ui_field_id] = map[meta.ui_field_id] || [];
          map[meta.ui_field_id].push(msg);
        }

        // 2. несколько полей (например economic_impact.value + unit)
        if (Array.isArray(meta.ui_field_ids)) {
          for (const id of meta.ui_field_ids) {
            map[id] = map[id] || [];
            map[id].push(msg);
          }
        }
      }

      return map;
    }, [evalRes]);


  /**
   * Audit mode: error map by path (for JSON textarea highlighting)
   * Uses e.path only; ignores meta.
   */
  const auditJsonErrorsByPath = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!evalRes?.errors) return map;

    for (const e of evalRes.errors as any[]) {
      const rawPath = e?.path || "";
      const path = normalizePathKey(rawPath);
      const msg = String(e?.message ?? "").trim();
      if (!path || !msg) continue;

      map[path] = map[path] || [];
      map[path].push(msg);
    }
    return map;
  }, [evalRes]);

  const artifactsHasError = isAudit && ((auditJsonErrorsByPath["artifacts"]?.length ?? 0) > 0 || (auditJsonErrorsByPath["/artifacts"]?.length ?? 0) > 0);
  const artifactsBlockRef = useRef<HTMLDivElement | null>(null);

  // грузим schema ВСЕГДА, иначе product-форма не появится
  useEffect(() => {
    (async () => {
      setUiErr(null);
      setUi(null);
      try {
        const r = isAudit ? await getUiSchema(projectId) : await getUiSchemaV1(projectId);
        setUi(r as any);
      } catch (e) {
        setUiErr(e);
      }
    })();
  }, [projectId, isAudit]);

  // audit-only scroll-to-textarea on errors
  useEffect(() => {
    if (!isAudit) return;
    if (!evalRes) return;
    if (evalRes.decision !== "reject" && evalRes.decision !== "need_more") return;

    const hasArtifactsError =
      (auditJsonErrorsByPath["artifacts"]?.length ?? 0) > 0 ||
      (auditJsonErrorsByPath["/artifacts"]?.length ?? 0) > 0;

    if (!hasArtifactsError) return;

    artifactsBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(() => {
      const ta = artifactsBlockRef.current?.querySelector("textarea") as HTMLTextAreaElement | null;
      ta?.focus();
    }, 150);
  }, [evalRes, auditJsonErrorsByPath, isAudit]);

  async function onEvaluate() {
    setEvalErr(null);
    setEvalRes(null);

    // product: отправляем artifacts из формы
    if (!isAudit) {
      setEvalBusy(true);
      try {
        const artifacts = extractArtifacts(formState);
        const r = await evaluateProject(projectId, { artifacts });
        setEvalRes(r as any);
      } catch (e) {
        setEvalErr(e);
      } finally {
        setEvalBusy(false);
      }
      return;
    }

    // audit: отправляем artifacts из JSON
    if (!parsed.ok) {
      setEvalErr(new Error(parsed.error));
      return;
    }

    setEvalBusy(true);
    try {
      const r = await evaluateProject(projectId, { artifacts: parsed.value });
      setEvalRes(r as any);
    } catch (e) {
      setEvalErr(e);
    } finally {
      setEvalBusy(false);
    }
  }

  const auditLinkTo = `/projects/${projectId}/audit`;
  const auditModeLinkTo = `${location.pathname}?mode=audit`;
  const productModeLinkTo = location.pathname;

  const schemaIsV1 = !!ui && (ui as any).ui_schema_version === "v1" && (ui as any).renderer === "form_v1";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {isAudit ? `Project ${projectId}` : "Проект"}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to={auditLinkTo}>{isAudit ? "Open immutable audit" : "Открыть протокол"}</Link>
            {isAudit ? (
              <Link to={productModeLinkTo}>В продуктовый режим</Link>
            ) : (
              <Link to={auditModeLinkTo}>В dev/audit режим</Link>
            )}
          </div>
        </div>

        <div>
          <Link to="/">{isAudit ? "← back" : "← назад"}</Link>
        </div>
      </div>

      {/* UI schema details — только audit */}
      {isAudit && (
        <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>UI schema</div>
          {ui === null ? (
            <div>Loading…</div>
          ) : uiErr ? (
            <ErrorBlock title="ui-schema error" error={uiErr} mode="audit" />
          ) : (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Show schema</summary>
              <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(ui, null, 2)}
              </pre>
            </details>
          )}
        </section>
      )}

      {/* Artifacts input */}
      <section ref={artifactsBlockRef} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          {isAudit ? "Artifacts (JSON)" : "Данные проверки"}
        </div>

        {/* PRODUCT: форма по UI-schema v1 */}
        {!isAudit ? (
          uiErr ? (
            <ErrorBlock title="ui-schema error" error={uiErr} mode="product" />
          ) : ui === null ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Загрузка формы…</div>
          ) : !schemaIsV1 ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              UI-schema не v1. Перейди в dev/audit режим для диагностики.{" "}
              <Link to={auditModeLinkTo}>В dev/audit режим</Link>
            </div>
          ) : (
            <FormRendererV1
              schema={ui as any}
              mode="product"
              value={formState}
              onChange={(next) => {
                setFormState(next);
                // UX: clear previous server errors on edit (no client hints)
                if (evalRes) setEvalRes(null);
                if (evalErr) setEvalErr(null);
              }}
              fieldErrors={productFieldErrorsById}
            />
          )
        ) : (
          /* AUDIT: JSON textarea */
          <>
            <div
              style={{
                border: artifactsHasError ? "1px solid #c00" : "1px solid transparent",
                borderRadius: 10,
                padding: artifactsHasError ? 8 : 0,
                background: artifactsHasError ? "#fff5f5" : "transparent",
              }}
            >
              <JsonTextarea label="artifacts" value={artifactsText} onChange={setArtifactsText} rows={18} />

              {artifactsHasError ? (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {(auditJsonErrorsByPath["artifacts"] ?? []).map((m, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#900" }}>
                      • {m}
                    </div>
                  ))}
                  {(auditJsonErrorsByPath["/artifacts"] ?? []).map((m, i) => (
                    <div key={`p-${i}`} style={{ fontSize: 12, color: "#900" }}>
                      • {m}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setArtifactsText(JSON.stringify(ARTIFACTS_TEMPLATE, null, 2))}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
              >
                Insert template
              </button>

              {!parsed.ok ? <span style={{ fontSize: 12, color: "#c00" }}>{parsed.error}</span> : null}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={onEvaluate}
            disabled={evalBusy || (!isAudit && !schemaIsV1)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {evalBusy ? (isAudit ? "Evaluating..." : "Проверка...") : isAudit ? "Evaluate" : "Проверить"}
          </button>
        </div>
      </section>

      {evalErr ? <ErrorBlock title="evaluate error" error={evalErr} mode={isAudit ? "audit" : "product"} /> : null}

      {/* Result */}
      {evalRes ? (
        <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          {(() => {
            const meta = decisionText(evalRes.decision);

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{meta.title}</div>
                    {decisionBadge(evalRes.decision)}
                  </div>
                  {isAudit ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>submission: {evalRes.submission_id ?? "—"}</div>
                  ) : null}
                </div>

                {meta.text ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{meta.text}</div> : null}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <div style={{ fontSize: 12 }}>
                    {isAudit ? (
                      <>
                        <div>
                          <b>current_gate_id:</b> {evalRes.current_gate_id ?? "—"}
                        </div>
                        <div>
                          <b>current_gate_version:</b> {evalRes.current_gate_version ?? "—"}
                        </div>
                        <div>
                          <b>project_state:</b> {evalRes.project_state ?? "—"}
                        </div>
                        <div>
                          <b>next_state:</b> {evalRes.next_state ?? "—"}
                        </div>
                      </>
                    ) : (
                      <div style={{ opacity: 0.7 }}>
                        Протокол доступен в dev/audit режиме. <Link to={auditModeLinkTo}>Открыть</Link>
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {evalRes.decision === "reject"
                        ? "Причины запрета"
                        : evalRes.decision === "need_more"
                        ? "Недостающие сведения"
                        : "Диагностика"}
                    </div>

                    {/* PRODUCT: errors are shown under fields; avoid duplicating list */}
                    {!isAudit ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Ошибки отмечены у соответствующих полей формы.
                      </div>
                    ) : Array.isArray(evalRes.errors) && evalRes.errors.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {evalRes.errors.map((e: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              border: "1px solid #ddd",
                              borderRadius: 8,
                              padding: 10,
                              background: "#fafafa",
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{e.message ?? "—"}</div>

                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              {e.path ? (
                                <>
                                  path: <b>{e.path}</b>
                                </>
                              ) : null}
                              {e.path && e.severity ? " · " : null}
                              {e.severity ? <>severity: {e.severity}</> : null}
                              {e.code ? (
                                <>
                                  {" "}
                                  · code: <b>{e.code}</b>
                                </>
                              ) : null}
                              {e?.meta?.ui_field_id ? (
                                <>
                                  {" "}
                                  · ui_field_id: <b>{String(e.meta.ui_field_id)}</b>
                                </>
                              ) : null}
                              {Array.isArray(e?.meta?.ui_field_ids) && e.meta.ui_field_ids.length ? (
                                <>
                                  {" "}
                                  · ui_field_ids: <b>{e.meta.ui_field_ids.join(", ")}</b>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>—</div>
                    )}
                  </div>
                </div>

                {isAudit && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Show raw response</summary>
                    <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(evalRes, null, 2)}
                    </pre>
                  </details>
                )}

                <div style={{ marginTop: 10, fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Link to={auditLinkTo}>{isAudit ? "Open immutable audit" : "Открыть протокол"}</Link>
                  {isAudit ? <Link to={productModeLinkTo}>В продуктовый режим</Link> : null}
                </div>
              </>
            );
          })()}
        </section>
      ) : null}
    </div>
  );
}

