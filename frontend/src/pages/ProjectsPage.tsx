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

      // СРАЗУ переходим на страницу проекта
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
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Create project</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="optional name"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
          <button
            onClick={onCreate}
            disabled={busy || !name.trim()}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      {err ? <ErrorBlock title="API error" error={err} /> : null}

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Projects</div>

        {projects === null ? (
          <div>Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No projects (or list endpoint missing).</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {projects.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    <Link to={`/projects/${p.id}`}>{p.title ?? p.id}</Link>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    state: {p.current_state ?? "—"} · created: {p.created_at ?? "—"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Link to={`/projects/${p.id}/audit`}>audit</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

