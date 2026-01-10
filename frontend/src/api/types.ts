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

export type GateError = {
  code: string;
  message?: string;
};

export type EvaluateResponse = {
  decision: string;
  next_state: string;
  errors: GateError[];
  submission_id: string;
  project_state: string;
  current_gate_id: string;
  current_gate_version: string;
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

export type AuditDetail = {
  submission_id: string;
  project_id: string;
  created_at: string;

  immutability: {
    is_immutable: boolean;
    stored_at: string;
  };

  request: {
    artifacts: unknown;
  };

  result: {
    decision: string;
    errors?: Array<{
      code?: string;
      path?: string;
      message?: string;
      meta?: unknown;
    }>;
    [k: string]: unknown;
  };

  gate_id?: string;
  gate_version?: string;
  state_before?: string;
  state_after?: string;
};

