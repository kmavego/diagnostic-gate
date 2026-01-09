import { UI_TEXT_RU } from "./uiText.ru";

export function formatAdmissionState(projectState?: string, lastDecision?: string): string {
  if (!projectState) return UI_TEXT_RU.states.notSubmitted;

  if (lastDecision === "BLOCK") return UI_TEXT_RU.states.admissionDenied;

  return `${UI_TEXT_RU.states.admissionStatePrefix} ${projectState}`;
}
