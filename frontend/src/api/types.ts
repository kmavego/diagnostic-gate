export type Project = {
  id: string;
  title?: string | null;
  description?: string | null;
  current_state?: string | null;
  current_gate_id?: string | null;
  current_gate_version?: string | null;
  created_at?: string | null;
};


export type UiSchemaResponse = {
  // Оставляем максимально гибко: реальную структуру берём из OpenAPI spec: openapi/openapi.v0.1.yaml
  // MVP: нам нужно хотя бы понять "какие артефакты" и показать json textarea.
  schema?: unknown;
  ui_schema?: unknown;
  meta?: unknown;
};

export type EvaluateRequest = {
  artifacts: Record<string, unknown>;
};

export type EvaluateResponse = {
  decision: "allow" | "reject" | "need_more" | "error" | string;
  next_state?: string | null;
  errors: unknown[];
  submission_id?: string;
  project_state?: string;
  current_gate_id?: string;
  current_gate_version?: string;
};

export type Submission = {
  submission_id?: string;
  project_id?: string;
  created_at?: string;
  decision?: string;
  current_gate_id?: string;
  current_gate_version?: string;
  payload?: unknown;
  result?: unknown;
};

