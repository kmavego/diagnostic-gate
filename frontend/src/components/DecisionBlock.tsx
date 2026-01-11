import React from "react";
import { UI_TEXT_RU } from "../canon/uiText.ru";
import type { EvaluateResponse } from "../api/types";

type Props = {
  result: EvaluateResponse;
  mode?: "product" | "audit";
};

export function DecisionBlock({ result, mode = "product" }: Props) {
  const isAudit = mode === "audit";

  // Внимание: в твоём новом UI на скринах decision = BLOCK,
  // а в другом фрагменте кода decision = "reject"/"allow"/...
  // Здесь оставляю как было в этом компоненте: "BLOCK".
  const isDenied = result.decision === "BLOCK";

  const title = isDenied ? UI_TEXT_RU.decision.deniedTitle : UI_TEXT_RU.decision.grantedTitle;
  const hint = isDenied ? UI_TEXT_RU.decision.deniedHint : UI_TEXT_RU.decision.grantedHint;

  // Протокольная “нарушенная норма” — только audit
  const violationCode = result.errors?.[0]?.code;

  return (
    <section className="rounded border p-4">
      <div className="text-sm font-medium opacity-80">{UI_TEXT_RU.decision.title}</div>

      <div className="mt-2 text-lg font-semibold">{title}</div>

      <div className="mt-3 space-y-1 text-sm">
        {/* В product-mode оставляем только бинарный исход (допуск/запрет).
           Решение уже отражено заголовком, но строка decision полезна как маркер. */}
        <Row
          label={UI_TEXT_RU.decision.fields.decision}
          value={result.decision}
          mono={isAudit} // в product-mode не надо “инженерного” моношрифта
        />

        {/* Всё, что ниже — протокол: только audit-mode */}
        {isAudit ? (
          <>
            <Row label={UI_TEXT_RU.decision.fields.gate} value={result.current_gate_id} />
            {violationCode ? (
              <Row label={UI_TEXT_RU.decision.fields.violation} value={violationCode} />
            ) : null}
            <Row label={UI_TEXT_RU.decision.fields.canon} value={result.current_gate_version} />
            <Row label={UI_TEXT_RU.decision.fields.stateBefore} value={result.project_state} />
            <Row label={UI_TEXT_RU.decision.fields.stateAfter} value={result.next_state} />
          </>
        ) : null}
      </div>

      <div className="mt-3 text-xs opacity-80">{hint}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <div className="w-44 opacity-70">{label}:</div>
      <div className={mono ? "font-mono" : ""}>{value ?? "—"}</div>
    </div>
  );
}

