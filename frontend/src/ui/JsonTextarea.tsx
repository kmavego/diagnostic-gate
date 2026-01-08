import React from "react";

type Props = {
  label: string;
  value: string;

  /**
   * Optional: used only when not readOnly.
   * For audit viewer, we pass readOnly and omit onChange.
   */
  onChange?: (v: string) => void;

  rows?: number;

  /**
   * Canon: allow read-only rendering for immutable snapshots.
   */
  readOnly?: boolean;
};

export function JsonTextarea(props: Props) {
  const { label, value, onChange, rows = 12, readOnly = false } = props;

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div>

      <textarea
        value={value}
        rows={rows}
        readOnly={readOnly}
        onChange={(e) => {
          if (readOnly) return;
          onChange?.(e.target.value);
        }}
        spellCheck={false}
        style={{
          width: "100%",
          minWidth: 0,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.35,
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 10,
          resize: "vertical",
          background: readOnly ? "#fafafa" : "#fff",
        }}
      />
    </div>
  );
}

