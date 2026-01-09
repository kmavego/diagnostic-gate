import type { EvaluateRequest, EvaluateResponse, Project, Submission, UiSchemaResponse } from "./types";

/**
 * Важное:
 * - X-Owner-Id обязателен (auth stub)
 * - frontend ничего не вычисляет: только показывает и отправляет
 */

const OWNER_ID = (import.meta as any).env?.VITE_OWNER_ID || "local-dev";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // 1) Заголовки: Content-Type ставим только если есть body
  const headers: Record<string, string> = {
    "X-Owner-Id": OWNER_ID,
    ...(init?.headers as any),
  };

  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // 2) Запрос
  const res = await fetch(`/api${path}`, { ...init, headers });

  // 3) Читаем текст всегда (и для ошибок, и для успешных ответов)
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  // 4) 204 / пустое тело
  if (res.status === 204 || text.trim() === "") {
    return undefined as any;
  }

  // 5) Пытаемся распарсить JSON даже если header content-type кривой/отсутствует
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as any;
  }
}


// --- Projects ---
export async function listProjects(): Promise<Project[]> {
  try {
    const r = await http<any>("/projects", { method: "GET" });
    return Array.isArray(r) ? (r as Project[]) : [];
  } catch {
    // список может отсутствовать в MVP — это не ошибка для UI
    return [];
  }
}


export async function createProject(payload?: { title?: string }): Promise<Project> {
  return http<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}


export async function getUiSchema(projectId: string): Promise<UiSchemaResponse> {
  return http<UiSchemaResponse>(`/projects/${projectId}/ui-schema`, { method: "GET" });
}

export async function evaluateProject(projectId: string, req: EvaluateRequest): Promise<EvaluateResponse> {
  return http<EvaluateResponse>(`/projects/${projectId}/evaluate`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// --- Audit ---
// Canonical API contract: openapi/openapi.v0.1.yaml
export async function listSubmissionsGlobal(): Promise<Submission[]> {
  return http<Submission[]>("/submissions", { method: "GET" });
}

export async function listSubmissionsByProject(projectId: string): Promise<Submission[]> {
  return http<Submission[]>(`/projects/${projectId}/submissions`, { method: "GET" });
}

export async function getSubmissionDetail(submissionId: string): Promise<Submission> {
  return http<Submission>(`/submissions/${encodeURIComponent(submissionId)}`, { method: "GET" });
}



