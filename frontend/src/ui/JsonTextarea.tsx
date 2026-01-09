import React from "react";

export function JsonTextarea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{props.label}</div>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={props.rows ?? 18}
        spellCheck={false}
        style={{
          width: "100%",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      />
    </label>
  );
}

