export type AppMode = "product" | "audit";

export function getModeFromSearch(search: string): AppMode {
  const sp = new URLSearchParams(search);
  return sp.get("mode") === "audit" ? "audit" : "product";
}

