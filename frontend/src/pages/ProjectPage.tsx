import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evaluateProject, getUiSchema } from "../api/api";
import type { EvaluateResponse, UiSchemaResponse } from "../api/types";
import { JsonTextarea } from "../ui/JsonTextarea";
import { ErrorBlock } from "../ui/ErrorBlock";

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
      return {
        title: "Недостаточно данных",
        text: "Гейт не может быть оценен. Нужно добавить недостающие артефакты.",
      };
    case "reject":
      return {
        title: "Запрет",
        text: "Проект не допускается. Ниже — причины запрета и что именно нужно исправить.",
      };
    case "error":
      return { title: "Ошибка", text: "Во время оценки произошла ошибка. См. детали ниже." };
    default:
      return { title: "Решение", text: "" };
  }
}

export function ProjectPage() {
  const { id } = useParams();
  const projectId = id || "";

  const [ui, setUi] = useState<UiSchemaResponse | null>(null);
  const [uiErr, setUiErr] = useState<unknown>(null);

  const [artifactsText, setArtifactsText] = useState<string>("{}");
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

  // ✅ Scroll + focus to artifacts after evaluate when it's actionable
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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Project {projectId}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            <Link to={`/projects/${projectId}/audit`}>Open audit</Link>
          </div>
        </div>
        <div>
          <Link to="/">← back</Link>
        </div>
      </div>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>UI schema</div>
        {ui === null ? (
          <div>Loading…</div>
        ) : uiErr ? (
          <ErrorBlock title="ui-schema error" error={uiErr} />
        ) : (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Show schema</summary>
            <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(ui, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section ref={artifactsBlockRef} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Artifacts (JSON)</div>

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

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          Минимум для прохождения гейта: опиши сценарий (кто действует, что делает неправильно, к чему это приводит) и
          зафиксируй цену ошибки так, чтобы было видно управленческое основание.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={onEvaluate}
            disabled={evalBusy}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {evalBusy ? "Evaluating..." : "Evaluate"}
          </button>

          <button
            onClick={() => setArtifactsText(JSON.stringify(ARTIFACTS_TEMPLATE, null, 2))}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            Insert template
          </button>

          {!parsed.ok ? <span style={{ fontSize: 12, color: "#c00" }}>{parsed.error}</span> : null}
        </div>
      </section>

      {evalErr ? <ErrorBlock title="evaluate error" error={evalErr} /> : null}

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
                  <div style={{ fontSize: 12, opacity: 0.7 }}>submission: {evalRes.submission_id ?? "—"}</div>
                </div>

                {meta.text ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{meta.text}</div> : null}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <div style={{ fontSize: 12 }}>
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
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>
                      {evalRes.decision === "reject"
                        ? "Причины запрета"
                        : evalRes.decision === "need_more"
                        ? "Что нужно добавить"
                        : "Диагностика"}
                    </div>

                    {Array.isArray(evalRes.errors) && evalRes.errors.length > 0 ? (
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
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>—</div>
                    )}
                  </div>
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.8 }}>Show raw response</summary>
                  <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(evalRes, null, 2)}
                  </pre>
                </details>

                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <Link to={`/projects/${projectId}/audit`}>Open audit</Link>
                </div>
              </>
            );
          })()}
        </section>
      ) : null}
    </div>
  );
}

