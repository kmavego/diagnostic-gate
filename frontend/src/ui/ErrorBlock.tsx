import React from "react";

type Props = {
  title: string;
  error: unknown;
  mode?: "product" | "audit";
};

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    try {
      return String(x);
    } catch {
      return "unprintable";
    }
  }
}

function extractMessage(err: unknown): string | null {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "Error";
  const maybeMsg = (err as any)?.message;
  if (typeof maybeMsg === "string") return maybeMsg;
  return null;
}

export function ErrorBlock({ title, error, mode = "product" }: Props) {
  const isAudit = mode === "audit";

  const text = (() => {
    if (isAudit) {
      // audit: максимум полезной информации
      if (error instanceof Error) {
        const head = error.message || "Error";
        const stack = typeof error.stack === "string" ? error.stack : "";
        return stack ? `${head}\n\n${stack}` : head;
      }

      const msg = extractMessage(error);
      if (msg) return msg;

      return safeStringify(error);
    }

    // product: минимум, без дампа объектов
    const msg = extractMessage(error);
    if (msg) return msg;

    return "Ошибка. Протокол доступен в режиме аудита.";
  })();

  return (
    <div style={{ border: "1px solid #f0c", borderRadius: 8, padding: 12, background: "#fff5ff" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{text}</pre>
    </div>
  );
}

