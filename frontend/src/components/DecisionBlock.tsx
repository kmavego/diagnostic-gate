import React from "react";
import { UI_TEXT_RU } from "../canon/uiText.ru";
import type { EvaluateResponse } from "../api/types";

type Props = {
  result: EvaluateResponse;
};

export function DecisionBlock({ result }: Props) {
  const isDenied = result.decision === "BLOCK";

  const title = isDenied
    ? UI_TEXT_RU.decision.deniedTitle
    : UI_TEXT_RU.decision.grantedTitle;

  const hint = isDenied
    ? UI_TEXT_RU.decision.deniedHint
    : UI_TEXT_RU.decision.grantedHint;

  return (
    <section className="rounded border p-4">
      <div className="text-sm font-medium opacity-80">
        {UI_TEXT_RU.decision.title}
      </div>

      <div className="mt-2 text-lg font-semibold">{title}</div>

      <div className="mt-3 space-y-1 text-sm">
        <Row label={UI_TEXT_RU.decision.fields.gate} value={result.current_gate_id} />
        <Row label={UI_TEXT_RU.decision.fields.decision} value={result.decision} />
        {result.errors?.[0]?.code ? (
          <Row label={UI_TEXT_RU.decision.fields.violation} value={result.errors[0].code} />
        ) : null}
        <Row label={UI_TEXT_RU.decision.fields.canon} value={result.current_gate_version} />
        <Row
          label={UI_TEXT_RU.decision.fields.stateTransition}
          value={`${result.project_state} → ${result.next_state}`}
        />
      </div>

      <div className="mt-3 text-xs opacity-80">{hint}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <div className="w-44 opacity-70">{label}:</div>
      <div className="font-mono">{value ?? "—"}</div>
    </div>
  );
}
