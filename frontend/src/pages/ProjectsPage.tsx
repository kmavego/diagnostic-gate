import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProject, listProjects } from "../api/api";
import type { Project } from "../api/types";
import { ErrorBlock } from "../ui/ErrorBlock";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const nav = useNavigate();

  async function refresh() {
    try {
      const items = await listProjects();
      setProjects(items);
    } catch {
      // молча: список не критичен
      setProjects([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    if (!name.trim()) return;

    setBusy(true);
    setErr(null);
    try {
      const p = await createProject(name.trim() ? { title: name.trim() } : {});
      setName("");

      // список может отсутствовать — не блокируем UX
      await refresh().catch(() => {});

      // СРАЗУ переходим на страницу проекта (product-mode по умолчанию)
      nav(`/projects/${p.id}`);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Создать проект</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название (необязательно)"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
          <button
            onClick={onCreate}
            disabled={busy || !name.trim()}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {busy ? "Создание..." : "Создать"}
          </button>
        </div>
      </section>

      {err ? <ErrorBlock title="Ошибка API" error={err} mode="product" /> : null}

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Проекты</div>

        {projects === null ? (
          <div>Загрузка…</div>
        ) : projects.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Проектов нет (или endpoint списка недоступен).</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {projects.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    <Link to={`/projects/${p.id}`}>{p.title ?? p.id}</Link>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    состояние: {p.current_state ?? "—"} · создан: {p.created_at ?? "—"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {/* Протокол = audit зона */}
                  <Link to={`/projects/${p.id}?mode=audit`}>Протокол</Link>
                  {/* Если хочешь вести именно на audit-страницу, можно заменить на: */}
                  {/* <Link to={`/projects/${p.id}/audit`}>Протокол</Link> */}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


