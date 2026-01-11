export type Project = {
  id: string;
  title?: string | null;
  description?: string | null;
  current_state?: string | null;
  current_gate_id?: string | null;
  current_gate_version?: string | null;
  created_at?: string | null;
};

export type UiSchemaV1 = {
  ui_schema_version: "v1";
  renderer: "form_v1";
  locale: string;

  gate: {
    id: string;
    version: string;
    title: string;
    objective?: string;
  };

  // optional legacy / future fields (keep permissive, since backend may add)
  submit?: unknown;
  artifacts_schema?: unknown;

  form: {
    sections: Array<{
      id: string;
      title: string;
      fields: Array<{
        id: string;
        artifact_path: string;
        label: string;
        description?: string;
        ui: {
          widget: "text" | "textarea" | "number" | "select";
          placeholder?: string;
          rows?: number;
          options?: Array<{ value: string; label: string }>;
        };
        value: {
          type: "string" | "number" | "object";
          constraints?: Record<string, any>;
        };
        visibility: {
          product: boolean;
          audit: boolean;
          audit_details?: boolean;
        };
      }>;
    }>;
  };
};

export type UiSchemaResponse = UiSchemaV1;

export type EvaluateRequest = {
  artifacts: Record<string, unknown>;
};

export type Decision = "allow" | "reject" | "need_more" | "error";

/**
 * Product UX Phase 1.1 — field binding metadata
 * Mirrors backend StructuredErrorMeta + OpenAPI StructuredErrorMeta.
 */
export type StructuredErrorMeta = {
  ui_field_id?: string;
  ui_field_ids?: string[];
  ui_block_id?: string;

  artifact_path?: string;
  rule_id?: string;
  gate_id?: string;
  gate_version?: string;
};

export type StructuredError = {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
  meta?: StructuredErrorMeta | null;
};

/**
 * Legacy minimal type (avoid breaking old imports).
 * Prefer StructuredError.
 */
export type GateError = {
  code: string;
  message?: string;
};

export type EvaluateResponse = {
  decision: Decision;
  next_state?: string | null;
  errors: StructuredError[];
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
      meta?: StructuredErrorMeta | unknown;
      severity?: "error" | "warning" | string;
    }>;
    [k: string]: unknown;
  };

  gate_id?: string;
  gate_version?: string;
  state_before?: string;
  state_after?: string;
};

