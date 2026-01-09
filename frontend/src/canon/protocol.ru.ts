// frontend/src/canon/protocol.ru.ts
import { UI_TEXT_RU } from "./uiText.ru";

export type Decision = "allow" | "reject" | "need_more" | "error" | string;

export function isAdmissionGranted(decision?: Decision): boolean {
  return decision === "allow";
}

export function decisionTitleRu(decision?: Decision): string {
  return isAdmissionGranted(decision) ? UI_TEXT_RU.decision.grantedTitle : UI_TEXT_RU.decision.deniedTitle;
}

export function decisionHintRu(decision?: Decision): string {
  return isAdmissionGranted(decision) ? UI_TEXT_RU.decision.grantedHint : UI_TEXT_RU.decision.deniedHint;
}
