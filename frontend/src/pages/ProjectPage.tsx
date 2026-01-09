import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evaluateProject, getUiSchema } from "../api/api";
import type { EvaluateResponse, UiSchemaResponse } from "../api/types";
import { JsonTextarea } from "../ui/JsonTextarea";
import { ErrorBlock } from "../ui/ErrorBlock";
import { UI_TEXT_RU } from "../canon/uiText.ru";
import { decisionHintRu, decisionTitleRu, type Decision } from "../canon/protocol.ru";

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: "Артефакты должны быть JSON-объектом." };
    }
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: "Некорректный JSON." };
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

function extractViolationCode(e: any): string | undefined {
  if (!e) return undefined;
  return e.code ?? e.error_code ?? e.errorCode ?? e.type ?? undefined;
}

export function ProjectPage() {
  const { id } = useParams();
  const projectId = id || "";

  const [ui, setUi] = useState<UiSchemaResponse | null>(null);
  const [uiErr, setUiErr] = useState<unknown>(null);

  const [artifactsText, setArtifactsText] = useState<string>("");
  const parsed = useMemo(() => safeParseJson(artifactsText), [artifactsText]);

  const [evalBusy, setEvalBusy] = useState(false);
  const [evalErr, setEvalErr] = useState<unknown>(null);
  const [evalRes, setEvalRes] = useState<EvaluateResponse | null>(null);

  const fieldErrors = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!evalRes?.errors) return map;

    for (const e of evalRes.errors as any[]) {
      const path = e?.path || "";
      const msg = (e?.message || "").trim();
      if (!path || !msg) continue;
      map[path] = map[path] || [];
      map[path].push(msg);
    }
    return map;
  }, [evalRes]);

  const artifactsHasError = (fieldErrors["artifacts"]?.length ?? 0) > 0;
  const artifactsBlockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setUiErr(null);
      setUi(null);
      try {
        const r = await getUiSchema(projectId);
        setUi(r);
      } catch (e) {
        setUiErr(e);
        setUi({} as any);
      }
    })();
  }, [projectId]);

  // scroll to artifacts only if backend explicitly points at artifacts
  useEffect(() => {
    if (!evalRes) return;
    if (evalRes.decision !== "reject" && evalRes.decision !== "need_more") return;

    const hasArtifactsError = (fieldErrors["artifacts"]?.length ?? 0) > 0;
    if (!hasArtifactsError) return;

    artifactsBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(() => {
      const ta = artifactsBlockRef.current?.querySelector("textarea") as HTMLTextAreaElement | null;
      ta?.focus();
    }, 150);
  }, [evalRes, fieldErrors]);

  async function onEvaluate() {
    setEvalErr(null);
    setEvalRes(null);

    if (!parsed.ok) {
      setEvalErr(new Error(parsed.error));
      return;
    }

    setEvalBusy(true);
    try {
      const r = await evaluateProject(projectId, { artifacts: parsed.value });
      setEvalRes(r);
    } catch (e) {
      setEvalErr(e);
    } finally {
      setEvalBusy(false);
    }
  }

  const decision = (evalRes?.decision ?? "") as Decision;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {UI_TEXT_RU.admission.title} · <span style={{ fontFamily: "monospace" }}>{projectId}</span>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>{UI_TEXT_RU.admission.subtitle}</div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            <Link to={`/projects/${projectId}/audit`}>{UI_TEXT_RU.audit.title}</Link>
          </div>
        </div>

        <div>
          <Link to="/">{UI_TEXT_RU.common.back}</Link>
        </div>
      </div>

      {/* UI schema */}
      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Контракт предъявления артефактов</div>
        {ui === null ? (
          <div>{UI_TEXT_RU.common.loading}</div>
        ) : uiErr ? (
          <ErrorBlock title="Ошибка получения контракта Gate" error={uiErr} />
        ) : (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Показать контракт Gate</summary>
            <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(ui, null, 2)}
            </pre>
          </details>
        )}
      </section>

      {/* Artifacts */}
      <section ref={artifactsBlockRef} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{UI_TEXT_RU.admission.artifactsTitle}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>{UI_TEXT_RU.admission.artifactsHint}</div>

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
              {fieldErrors["artifacts"].map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: "#900" }}>
                  • {m}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={onEvaluate}
            disabled={evalBusy}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {evalBusy ? UI_TEXT_RU.common.loading : UI_TEXT_RU.admission.submit}
          </button>

          <span style={{ fontSize: 12, opacity: 0.75 }}>{UI_TEXT_RU.admission.submitHint}</span>

          {!parsed.ok ? <span style={{ fontSize: 12, color: "#c00" }}>{parsed.error}</span> : null}
        </div>
      </section>

      {evalErr ? <ErrorBlock title="evaluate error" error={evalErr} /> : null}

      {/* Decision */}
      {evalRes ? (
        <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{UI_TEXT_RU.decision.title}</div>
              {decisionBadge(evalRes.decision)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {UI_TEXT_RU.decision.fields.submission}: {evalRes.submission_id ?? UI_TEXT_RU.common.dash}
            </div>
          </div>

          <div style={{ marginTop: 8, fontWeight: 900, fontSize: 16 }}>
            {decisionTitleRu(decision)}
          </div>

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            {decisionHintRu(decision)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={{ fontSize: 12 }}>
              <div>
                <b>{UI_TEXT_RU.decision.fields.gate}:</b> {evalRes.current_gate_id ?? UI_TEXT_RU.common.dash}
              </div>
              <div>
                <b>{UI_TEXT_RU.decision.fields.canon}:</b> {evalRes.current_gate_version ?? UI_TEXT_RU.common.dash}
              </div>
              <div>
                <b>{UI_TEXT_RU.decision.fields.stateBefore}:</b> {evalRes.project_state ?? UI_TEXT_RU.common.dash}
              </div>
              <div>
                <b>{UI_TEXT_RU.decision.fields.stateAfter}:</b> {evalRes.next_state ?? UI_TEXT_RU.common.dash}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12 }}>
                {UI_TEXT_RU.decision.errors.title}
              </div>

              {Array.isArray(evalRes.errors) && evalRes.errors.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {evalRes.errors.map((e: any, i: number) => {
                    const code = extractViolationCode(e);
                    return (
                      <div
                        key={i}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          padding: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 12 }}>
                            {code ?? UI_TEXT_RU.common.dash}
                          </span>
                          {e.path ? (
                            <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>
                              {e.path}
                            </span>
                          ) : null}
                        </div>
                        {e.message ? (
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{e.message}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{UI_TEXT_RU.decision.errors.empty}</div>
              )}
            </div>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>
              {UI_TEXT_RU.decision.raw.show}
            </summary>
            <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(evalRes, null, 2)}
            </pre>
          </details>

          <div style={{ marginTop: 10, fontSize: 12 }}>
            <Link to={`/projects/${projectId}/audit`}>{UI_TEXT_RU.audit.title}</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
