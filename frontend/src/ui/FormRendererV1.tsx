import React from "react";
import { getByPath, setByPath } from "./formState";

type UiOption = { value: string; label: string };

type FieldV1 = {
  id: string;
  artifact_path: string; // e.g. "artifacts.target_action"
  label: string;
  description?: string;
  ui: {
    widget: "text" | "textarea" | "number" | "select";
    placeholder?: string;
    rows?: number;
    options?: UiOption[];
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
};

type SectionV1 = {
  id: string;
  title: string;
  fields: FieldV1[];
};

export type UiSchemaV1 = {
  ui_schema_version: "v1";
  renderer: "form_v1";
  locale?: string;
  gate: { id: string; version: string; title: string; objective?: string };
  form: { sections: SectionV1[] };
};

type StructuredErrorMeta = {
  ui_field_id?: string | null;
  ui_field_ids?: string[] | null;
  ui_block_id?: string | null;
  [k: string]: unknown;
};

export type StructuredError = {
  code?: string;
  message?: string;
  path?: string;
  severity?: "error" | "warning" | string;
  meta?: StructuredErrorMeta | null;
};

type Props = {
  schema: UiSchemaV1;
  mode: "product" | "audit";
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;

  /**
   * Product UX Phase 1.1:
   * errors are optional; if provided, show them under fields by meta.ui_field_id/ui_field_ids
   */
  errors?: StructuredError[];
  fieldErrors?: Record<string, string[]>;
};

function showField(f: FieldV1, mode: "product" | "audit") {
  return mode === "product" ? !!f.visibility?.product : !!f.visibility?.audit;
}

function messagesForField(
  errors: StructuredError[] | undefined,
  fieldErrors: Record<string, string[]> | undefined,
  fieldId: string
): string[] {
  const direct = fieldErrors?.[fieldId];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  if (!errors || errors.length === 0) return [];

  const out: string[] = [];
  for (const e of errors) {
    const msg = (e?.message || "").trim();
    if (!msg) continue;

    const meta = e?.meta || undefined;
    const m1 = meta?.ui_field_id ? String(meta.ui_field_id) : "";
    const mMany = Array.isArray(meta?.ui_field_ids) ? meta!.ui_field_ids!.map(String) : [];

    if (m1 === fieldId || mMany.includes(fieldId)) out.push(msg);
  }
  return out;
}


export function FormRendererV1({ schema, mode, value, onChange, errors, fieldErrors }: Props) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {schema.form.sections.map((s) => (
        <section key={s.id} style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>{s.title}</div>

          <div style={{ display: "grid", gap: 10 }}>
            {s.fields
              .filter((f) => showField(f, mode))
              .map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  mode={mode}
                  value={value}
                  onChange={onChange}
                  errorMessages={messagesForField(errors, fieldErrors, f.id)}

                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FieldRow({
  field,
  mode,
  value,
  onChange,
  errorMessages,
}: {
  field: FieldV1;
  mode: "product" | "audit";
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  errorMessages: string[];
}) {
  const v = getByPath(value, field.artifact_path);
  const placeholder = field.ui.placeholder ?? "";
  const hasError = errorMessages.length > 0;

  const labelBlock = (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{field.label}</div>
      {field.description ? <div style={{ fontSize: 12, opacity: 0.75 }}>{field.description}</div> : null}
      {mode === "audit" ? (
        <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "monospace" }}>{field.artifact_path}</div>
      ) : null}
    </div>
  );

  function set(nextVal: any) {
    onChange(setByPath(value, field.artifact_path, nextVal));
  }

  const commonInputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: hasError ? "1px solid #c00" : "1px solid #ddd",
    outline: "none",
  };

  const errorBlock = hasError ? (
    <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
      {errorMessages.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: "#900" }}>
          • {m}
        </div>
      ))}
    </div>
  ) : null;

  if (field.ui.widget === "select") {
    const opts = field.ui.options ?? [];
    const cur = typeof v === "string" ? v : "";
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {labelBlock}
        <select value={cur} onChange={(e) => set(e.target.value)} style={commonInputStyle}>
          <option value="" disabled>
            —
          </option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {errorBlock}
      </div>
    );
  }

  if (field.ui.widget === "number") {
    const cur = typeof v === "number" ? String(v) : v == null ? "" : String(v);
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {labelBlock}
        <input
          type="number"
          value={cur}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return set(undefined);
            const num = Number(raw);
            set(Number.isFinite(num) ? num : undefined);
          }}
          style={commonInputStyle}
        />
        {errorBlock}
      </div>
    );
  }

  if (field.ui.widget === "textarea") {
    const cur = typeof v === "string" ? v : v == null ? "" : String(v);
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {labelBlock}
        <textarea
          value={cur}
          placeholder={placeholder}
          rows={field.ui.rows ?? 6}
          onChange={(e) => set(e.target.value)}
          style={{ ...commonInputStyle, resize: "vertical" }}
        />
        {errorBlock}
      </div>
    );
  }

  const cur = typeof v === "string" ? v : v == null ? "" : String(v);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {labelBlock}
      <input value={cur} placeholder={placeholder} onChange={(e) => set(e.target.value)} style={commonInputStyle} />
      {errorBlock}
    </div>
  );
}

