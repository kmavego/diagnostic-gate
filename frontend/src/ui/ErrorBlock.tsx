import React from "react";

export function ErrorBlock(props: { title: string; error: unknown }) {
  return (
    <div style={{ border: "1px solid #f0c", borderRadius: 8, padding: 12, background: "#fff5ff" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{props.title}</div>
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
        {(() => {
          const msg = (props.error as any)?.message ?? props.error;
          return typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
        })()}
      </pre>
    </div>
  );
}

