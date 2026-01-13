import type {
  EvaluateRequest,
  EvaluateResponse,
  Project,
  Submission,
  UiSchemaResponse,
  AuditDetail,
  UiSchemaV1,
} from "./types";

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

    // Support both shapes:
    // - MVP legacy: Project[]
    // - OpenAPI v0.1: { items: Project[], total: number }
    if (Array.isArray(r)) return r as Project[];

    const items = (r as any)?.items;
    if (Array.isArray(items)) return items as Project[];

    return [];
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

/**
 * Legacy frozen UI schema (v0.1) — dev/audit mode
 */
export async function getUiSchema(projectId: string): Promise<UiSchemaResponse> {
  return http<UiSchemaResponse>(`/projects/${encodeURIComponent(projectId)}/ui-schema`, { method: "GET" });
}

/**
 * Product UI schema v1 — product mode
 * Separate endpoint to avoid breaking frozen OpenAPI v0.1.
 */
export async function getUiSchemaV1(projectId: string): Promise<UiSchemaV1> {
  return http<UiSchemaV1>(`/projects/${encodeURIComponent(projectId)}/ui-schema-v1`, { method: "GET" });
}

export async function evaluateProject(projectId: string, req: EvaluateRequest): Promise<EvaluateResponse> {
  return http<EvaluateResponse>(`/projects/${encodeURIComponent(projectId)}/evaluate`, {
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
  return http<Submission[]>(`/projects/${encodeURIComponent(projectId)}/submissions`, { method: "GET" });
}

export async function getSubmissionDetail(submissionId: string): Promise<AuditDetail> {
  return http<AuditDetail>(`/submissions/${encodeURIComponent(submissionId)}`, { method: "GET" });
}

// -----------------------------------------------------------------------------
// Prefill source (read-only): artifacts из последнего immutable submission.
// Никаких изменений OpenAPI, backend, engine. Никаких "умных" трансформаций.
// -----------------------------------------------------------------------------

export type LatestSubmissionArtifacts = {
  submission_id: string;
  artifacts: Record<string, any>;
};

function isPlainObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function submissionIdOf(s: any): string | null {
  const id = s?.submission_id ?? s?.submissionId ?? s?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function submissionTsOf(s: any): number {
  // Поддерживаем разные возможные поля времени, не полагаясь на строгий формат.
  const candidates = [
    s?.created_at,
    s?.createdAt,
    s?.submitted_at,
    s?.submittedAt,
    s?.timestamp,
    s?.ts,
  ];

  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const t = Date.parse(c);
      if (!Number.isNaN(t)) return t;
    }
  }
  return 0;
}

function extractArtifacts(detail: any): Record<string, any> | null {
  // Ожидаемый источник: request snapshot внутри immutable submission detail.
  // Поддерживаем несколько возможных форм, чтобы не привязываться к одному имени поля.
  const a =
    detail?.request?.artifacts ??
    detail?.snapshot?.request?.artifacts ??
    detail?.audit?.request?.artifacts ??
    detail?.artifacts;

  return isPlainObject(a) ? a : null;
}

/**
 * Возвращает artifacts из последнего submission для проекта.
 * - Если submissions нет → null
 * - Если artifacts отсутствует/не объект → null
 *
 * ВАЖНО: это только чтение immutable audit snapshot, без каких-либо трансформаций.
 */
export async function getLatestSubmissionArtifacts(projectId: string): Promise<LatestSubmissionArtifacts | null> {
  const subs = await listSubmissionsByProject(projectId);
  if (!Array.isArray(subs) || subs.length === 0) return null;

  // Выбираем "самый последний" по timestamp, если он доступен; иначе — последний в массиве.
  let latest: any = subs[subs.length - 1];
  let bestTs = submissionTsOf(latest);

  for (const s of subs as any[]) {
    const ts = submissionTsOf(s);
    if (ts >= bestTs) {
      bestTs = ts;
      latest = s;
    }
  }

  const submission_id = submissionIdOf(latest);
  if (!submission_id) return null;

  const detail = await getSubmissionDetail(submission_id);
  const artifacts = extractArtifacts(detail);
  if (!artifacts) return null;

  return { submission_id, artifacts };
}

