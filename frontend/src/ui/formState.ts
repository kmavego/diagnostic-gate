export type AnyRecord = Record<string, any>;

export function getByPath(obj: AnyRecord, path: string): any {
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setByPath(obj: AnyRecord, path: string, value: any): AnyRecord {
  const parts = path.split(".");
  if (parts.length === 0) return obj;

  // shallow clone root
  const root: AnyRecord = Array.isArray(obj) ? [...(obj as any)] : { ...(obj || {}) };

  let cur: any = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    const isLast = i === parts.length - 1;

    if (isLast) {
      cur[key] = value;
      break;
    }

    const next = cur[key];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[key] = {};
    } else {
      // clone intermediate object to keep immutability
      cur[key] = { ...next };
    }

    cur = cur[key];
  }

  return root;
}

/**
 * В product-mode мы храним форму как объект вида:
 * { artifacts: {...} }
 * Чтобы отправить в evaluate, просто достаём artifacts.
 */
export function extractArtifacts(formState: AnyRecord): AnyRecord {
  const artifacts = formState?.artifacts;
  if (artifacts && typeof artifacts === "object" && !Array.isArray(artifacts)) return artifacts;
  return {};
}

