from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict, Tuple
from pathlib import Path
import re

import yaml


class NotImplementedEngine(Exception):
    """
    Backward-compatibility exception for tests.
    In deterministic MVP engine this is not raised, but kept to avoid import errors.
    """
    pass


# -----------------------------
# Types (runtime contract)
# -----------------------------
class EngineError(TypedDict, total=False):
    artifact_id: str
    error_code: str
    reason_class: str
    message_variant: str  # "short" | "normal" | "detailed"
    message: str
    offending_spans: List[Dict[str, Any]]
    missing_fields: List[str]

    # Product UX Phase 1.1 — UI binding
    ui_field_id: str
    ui_field_ids: List[str]
    ui_block_id: str


class EngineResult(TypedDict, total=False):
    decision: str          # "PASS" | "BLOCK"
    next_state: Optional[str]
    errors: List[EngineError]


# -----------------------------
# Helpers: load YAMLs once
# -----------------------------
_ROOT = Path(__file__).resolve().parents[1]

_UX_CACHE: Optional[Dict[str, Any]] = None
_LEX_CACHE: Optional[Dict[str, Any]] = None
_FORB_CACHE: Optional[Dict[str, Any]] = None


def _load_yaml(path: Path) -> Dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _ux() -> Dict[str, Any]:
    global _UX_CACHE
    if _UX_CACHE is None:
        _UX_CACHE = _load_yaml(_ROOT / "ux_messages.yaml")
    return _UX_CACHE


def _lex() -> Dict[str, Any]:
    global _LEX_CACHE
    if _LEX_CACHE is None:
        _LEX_CACHE = _load_yaml(_ROOT / "lexical_noise.yaml")
    return _LEX_CACHE


def _forbidden() -> Dict[str, Any]:
    global _FORB_CACHE
    if _FORB_CACHE is None:
        _FORB_CACHE = _load_yaml(_ROOT / "forbidden_patterns.yaml")
    return _FORB_CACHE


def _msg(error_code: str, variant: str = "normal") -> str:
    for m in _ux().get("messages", []):
        if m.get("error_code") == error_code:
            v = m.get("variants", {})
            return v.get(variant) or v.get("normal") or ""
    return ""


def _reason_class_for(error_code: str) -> str:
    for m in _ux().get("messages", []):
        if m.get("error_code") == error_code:
            return m.get("reason_class", "")
    return ""


# -----------------------------
# String utilities
# -----------------------------
_RU_WORD_RE = re.compile(r"[А-Яа-яЁёA-Za-z0-9%]+", re.UNICODE)


def _words(text: str) -> List[str]:
    return _RU_WORD_RE.findall(text or "")


def _contains_any(text: str, needles: List[str]) -> bool:
    t = (text or "").lower()
    return any(n.lower() in t for n in needles)


def _first_span(text: str, needle: str) -> Optional[Dict[str, Any]]:
    """Return a simple offending span for first occurrence."""
    if not text or not needle:
        return None
    t_low = text.lower()
    n_low = needle.lower()
    idx = t_low.find(n_low)
    if idx < 0:
        return None
    return {"start": idx, "end": idx + len(needle), "text": text[idx: idx + len(needle)]}


def _make_error(
    artifact_id: str,
    error_code: str,
    variant: str = "normal",
    spans: Optional[List[Dict[str, Any]]] = None,
    missing_fields: Optional[List[str]] = None,
    *,
    ui_field_id: Optional[str] = None,
    ui_field_ids: Optional[List[str]] = None,
    ui_block_id: Optional[str] = None,
) -> EngineError:
    err: EngineError = {
        "artifact_id": artifact_id,
        "error_code": error_code,
        "reason_class": _reason_class_for(error_code),
        "message_variant": variant,
        "message": _msg(error_code, variant),
        "offending_spans": spans or [],
        "missing_fields": missing_fields or [],
        # Default binding: same-named UI field as artifact_id
        "ui_field_id": ui_field_id or artifact_id,
    }
    if ui_field_ids:
        err["ui_field_ids"] = ui_field_ids
    if ui_block_id:
        err["ui_block_id"] = ui_block_id
    return err


# -----------------------------
# Shared dictionaries (from yaml)
# -----------------------------
def _state_verbs() -> List[str]:
    return _lex().get("lexical_noise", {}).get("state_verbs_ru", []) or []


def _soft_modals() -> List[str]:
    return _lex().get("lexical_noise", {}).get("soft_modals_ru", []) or []


def _universality_claims() -> List[str]:
    return _lex().get("lexical_noise", {}).get("universality_claims_ru", []) or []


def _pattern_triggers(name: str) -> List[str]:
    return _forbidden().get("patterns", {}).get(name, {}).get("triggers", []) or []


def _topic_only_titles_examples() -> List[str]:
    return _forbidden().get("patterns", {}).get("topic_only_titles", {}).get("examples", []) or []


# -----------------------------
# Heuristics for alignment
# -----------------------------
_STOPWORDS = {
    "и", "а", "но", "в", "во", "на", "к", "ко", "из", "у", "по", "при", "если", "то", "не",
    "это", "как", "что", "чтобы", "ли", "для", "или", "же", "без", "до", "после", "над", "под",
    "когда", "вместо", "с", "со", "о", "об", "от", "за", "про", "их", "его", "ее"
}


def _keywords(text: str) -> List[str]:
    toks = [w.lower() for w in _words(text)]
    # keep meaningful tokens
    return [t for t in toks if len(t) >= 4 and t not in _STOPWORDS]


def _goal_rule_mismatch(goal: str, rule: str) -> bool:
    """
    Minimal deterministic substitute for 'semantic_distance'.
    считаем mismatch, если нет пересечения ключевых слов.
    """
    gk = set(_keywords(goal))
    rk = set(_keywords(rule))
    if not gk or not rk:
        return True
    return len(gk.intersection(rk)) == 0


# -----------------------------
# Gate evaluators
# -----------------------------
def _eval_problem_validation(artifacts: Dict[str, Any]) -> Tuple[str, Optional[str], List[EngineError]]:
    errs: List[EngineError] = []

    target_action = str(artifacts.get("target_action", "") or "")
    error_scenario = str(artifacts.get("error_scenario", "") or "")
    economic_impact = artifacts.get("economic_impact")

    # target_action: forbidden verbs
    for v in _state_verbs():
        if v.lower() in target_action.lower():
            span = _first_span(target_action, v)
            errs.append(_make_error(
                "target_action",
                "ERR_VAGUE_OBJECTIVE",
                spans=[span] if span else [],
                ui_field_id="target_action",
            ))
            break

    # error_scenario: must contain context tokens and be concrete
    if len(_words(error_scenario)) < 20:
        errs.append(_make_error(
            "error_scenario",
            "ERR_INCOMPLETE_ERROR_SCENARIO",
            ui_field_id="error_scenario",
        ))
    if not _contains_any(error_scenario, ["когда", "если", "в случае"]):
        # treat as incomplete (same error)
        if not any(e["error_code"] == "ERR_INCOMPLETE_ERROR_SCENARIO" and e["artifact_id"] == "error_scenario" for e in errs):
            errs.append(_make_error(
                "error_scenario",
                "ERR_INCOMPLETE_ERROR_SCENARIO",
                ui_field_id="error_scenario",
            ))

    # abstract error: vague consequences OR "проблемы/эффективность" без конкретики
    vague = _lex().get("lexical_noise", {}).get("vague_consequences_ru", [])
    abstract_markers = vague + [
        "появляются проблемы",
        "возникают проблемы",
        "становится хуже",
        "становится лучше",
        "снижается эффективность",
        "повышается эффективность",
        "улучшается взаимодействие",
    ]
    if _contains_any(error_scenario, abstract_markers):
        errs.append(_make_error(
            "error_scenario",
            "ERR_ABSTRACT_ERROR",
            ui_field_id="error_scenario",
        ))

    # economic impact thresholds
    if not isinstance(economic_impact, dict) or "value" not in economic_impact or "unit" not in economic_impact:
        missing: List[str] = []
        if not isinstance(economic_impact, dict) or "value" not in economic_impact:
            missing.append("value")
        if not isinstance(economic_impact, dict) or "unit" not in economic_impact:
            missing.append("unit")

        ui_ids = [f"economic_impact.{m}" for m in missing] if missing else ["economic_impact.value", "economic_impact.unit"]
        errs.append(_make_error(
            "economic_impact",
            "ERR_LOW_BUSINESS_IMPACT",
            missing_fields=missing or ["value", "unit"],
            ui_field_id=ui_ids[0],
            ui_field_ids=ui_ids,
        ))
    else:
        try:
            value = float(economic_impact["value"])
            unit = str(economic_impact["unit"])
        except Exception:
            # parsing error: most often value is not a number
            errs.append(_make_error(
                "economic_impact",
                "ERR_LOW_BUSINESS_IMPACT",
                ui_field_id="economic_impact.value",
            ))
        else:
            thresholds = {
                "USD": 500.0,
                "RUB": 30000.0,
                "Hours": 40.0,
                "Conversion%": 1.0,
            }
            if unit not in thresholds:
                errs.append(_make_error(
                    "economic_impact",
                    "ERR_LOW_BUSINESS_IMPACT",
                    ui_field_id="economic_impact.unit",
                ))
            elif value < thresholds[unit]:
                errs.append(_make_error(
                    "economic_impact",
                    "ERR_LOW_BUSINESS_IMPACT",
                    ui_field_id="economic_impact.value",
                ))

    if errs:
        return "BLOCK", None, errs
    return "PASS", "VALIDATED_PROBLEM", []


def _eval_goal_to_admission(artifacts: Dict[str, Any]) -> Tuple[str, Optional[str], List[EngineError]]:
    errs: List[EngineError] = []

    learning_goal = str(artifacts.get("learning_goal", "") or "")
    decision_context = str(artifacts.get("decision_context", "") or "")
    admission_rule = str(artifacts.get("admission_rule", "") or "")

    # Declarative goal
    if _contains_any(learning_goal, _state_verbs()) or _contains_any(learning_goal, _lex().get("lexical_noise", {}).get("abstract_nouns_ru", [])):
        errs.append(_make_error("learning_goal", "ERR_DECLARATIVE_GOAL"))

    # Non-operational goal: missing action/context/standard signals
    # minimal heuristic: must contain "при" or "если" and at least one verb-like token (ending with "ет"/"ит"/"ет"/"ют" rough)
    if not _contains_any(learning_goal, ["при", "если", "когда"]) or len(_keywords(learning_goal)) < 3:
        errs.append(_make_error("learning_goal", "ERR_NON_OPERATIONAL_GOAL"))

    # Decision context must include trigger and alternatives
    if not _contains_any(decision_context, ["триггер", "если", "когда"]) or not _contains_any(decision_context, ["альтернатив", "вариант", "(1)", "1)"]):
        errs.append(_make_error("decision_context", "ERR_NO_DECISION_CONTEXT"))

    # Admission rule must be binary and match pattern
    if not admission_rule.strip().lower().startswith("запрещать") or _contains_any(admission_rule, _soft_modals()):
        errs.append(_make_error("admission_rule", "ERR_INVALID_ADMISSION_RULE"))
    # Goal-rule mismatch
    if admission_rule.strip() and learning_goal.strip() and _goal_rule_mismatch(learning_goal, admission_rule):
        errs.append(_make_error("admission_rule", "ERR_GOAL_RULE_MISMATCH", variant="detailed"))

    if errs:
        return "BLOCK", None, errs
    return "PASS", "ADMISSION_DEFINED", []


def _eval_content_to_decisions(artifacts: Dict[str, Any]) -> Tuple[str, Optional[str], List[EngineError]]:
    errs: List[EngineError] = []

    content_outline = artifacts.get("content_outline")
    decisions = artifacts.get("critical_decisions_map")
    links = artifacts.get("error_prevention_links")

    # content_outline must be list with >=3
    if not isinstance(content_outline, list) or len(content_outline) < 3:
        errs.append(_make_error("content_outline", "ERR_CONTENT_WITHOUT_DECISIONS"))
    else:
        # topic-only titles
        generic = [e.lower() for e in _topic_only_titles_examples()]
        if any(str(it).strip().lower() in generic for it in content_outline):
            errs.append(_make_error("content_outline", "ERR_CONTENT_WITHOUT_DECISIONS"))

    # decisions list >= 3
    if not isinstance(decisions, list) or len(decisions) < 3:
        errs.append(_make_error("critical_decisions_map", "ERR_INSUFFICIENT_DECISIONS"))
    else:
        # theoretical decisions
        for d in decisions:
            dp = str((d or {}).get("decision_point", "") or "")
            if _contains_any(dp, _pattern_triggers("theoretical_choices_only")) or _contains_any(dp, _state_verbs()):
                errs.append(_make_error("critical_decisions_map", "ERR_THEORETICAL_DECISIONS"))
                break

    # links must exist and cover each decision (by simple count)
    if not isinstance(links, list) or len(links) == 0:
        errs.append(_make_error("error_prevention_links", "ERR_CONTENT_NOT_PREVENTING_ERRORS", variant="detailed"))
    else:
        if isinstance(decisions, list) and len(decisions) >= 1 and len(links) < len(decisions):
            errs.append(_make_error("error_prevention_links", "ERR_CONTENT_NOT_PREVENTING_ERRORS", variant="detailed"))

        # reject generic benefits in prevented_error/rationale
        for l in links:
            pe = str((l or {}).get("prevented_error", "") or "")
            ra = str((l or {}).get("rationale", "") or "")
            if _contains_any(pe + " " + ra, _pattern_triggers("generic_benefits")):
                errs.append(_make_error("error_prevention_links", "ERR_CONTENT_NOT_PREVENTING_ERRORS", variant="detailed"))
                break

    if errs:
        return "BLOCK", None, errs
    return "PASS", "DECISIONS_DEFINED", []


def _eval_assessment_to_admission(artifacts: Dict[str, Any]) -> Tuple[str, Optional[str], List[EngineError]]:
    errs: List[EngineError] = []

    assessment_design = str(artifacts.get("assessment_design", "") or "")
    admission_decision = str(artifacts.get("admission_decision", "") or "")
    failure_consequences = str(artifacts.get("failure_consequences", "") or "")

    # knowledge assessment markers
    if _contains_any(assessment_design, ["тест", "вопрос", "самооцен"]):
        errs.append(_make_error("assessment_design", "ERR_KNOWLEDGE_ASSESSMENT"))

    # must be failable: require "провал" marker
    if not _contains_any(assessment_design, ["провал", "проваливается", "провал —", "провал -"]):
        errs.append(_make_error("assessment_design", "ERR_NON_FAILABLE_ASSESSMENT"))

    # admission must be binary, no soft modals
    if _contains_any(admission_decision, _soft_modals()) or not _contains_any(admission_decision, ["допуск", "недопуск", "заблок", "запрет"]):
        errs.append(_make_error("admission_decision", "ERR_SOFT_ADMISSION", variant="detailed"))

    # consequences must contain real block + remediation; reject "повторите материал"
    if _contains_any(failure_consequences, _pattern_triggers("no_real_consequences")) or not _contains_any(failure_consequences, ["заблок", "блок", "запрещ"]):
        errs.append(_make_error("failure_consequences", "ERR_NO_REAL_CONSEQUENCE", variant="detailed"))

    if errs:
        return "BLOCK", None, errs
    return "PASS", "ADMISSION_ENFORCED", []


def _eval_universality_filter(artifacts: Dict[str, Any]) -> Tuple[str, Optional[str], List[EngineError]]:
    errs: List[EngineError] = []

    audience_bounds = str(artifacts.get("audience_bounds", "") or "")
    entry_diag = str(artifacts.get("entry_level_diagnostics", "") or "")
    branching = str(artifacts.get("branching_or_paths", "") or "")
    risks = artifacts.get("contraindications_and_risks")

    # universal audience
    if _contains_any(audience_bounds, _universality_claims()):
        errs.append(_make_error("audience_bounds", "ERR_UNIVERSAL_AUDIENCE"))

    # no exclusions
    if not _contains_any(audience_bounds, ["исключ", "не допущ", "противопоказ", "нельзя"]):
        errs.append(_make_error("audience_bounds", "ERR_NO_EXCLUSION_CRITERIA"))

    # self declared levels
    if _contains_any(entry_diag, _pattern_triggers("self_declared_levels")):
        errs.append(_make_error("entry_level_diagnostics", "ERR_SELF_DECLARED_LEVEL"))

    # no branching: require at least 2 path markers or "Путь" appears >=2
    if branching.lower().count("путь") < 2 or not _contains_any(branching, ["гейтинг", "провер", "недопуск", "перевод"]):
        errs.append(_make_error("branching_or_paths", "ERR_NO_BRANCHING"))

    # contraindications and risks: list >=2
    if not isinstance(risks, list) or len(risks) < 2:
        errs.append(_make_error("contraindications_and_risks", "ERR_NO_CONTRAINDICATIONS", variant="detailed"))

    if errs:
        return "BLOCK", None, errs
    return "PASS", "SCOPE_AND_PATHS_DEFINED", []


# -----------------------------
# Public API
# -----------------------------
def evaluate_gate(
    *,
    gate_id: str,
    gate_version: str,
    state: str,
    artifacts: Dict[str, Any],
) -> EngineResult:
    """
    Deterministic MVP evaluator for Gates 01–05.
    - No LLM.
    - Minimal heuristics aligned with current corpus and UX codes.
    """
    gid = (gate_id or "").strip()

    if gid == "PROBLEM_VALIDATION_01":
        decision, next_state, errors = _eval_problem_validation(artifacts)
    elif gid == "GOAL_TO_ADMISSION_02":
        decision, next_state, errors = _eval_goal_to_admission(artifacts)
    elif gid == "CONTENT_TO_DECISIONS_03":
        decision, next_state, errors = _eval_content_to_decisions(artifacts)
    elif gid == "ASSESSMENT_TO_ADMISSION_04":
        decision, next_state, errors = _eval_assessment_to_admission(artifacts)
    elif gid == "UNIVERSALITY_FILTER_05":
        decision, next_state, errors = _eval_universality_filter(artifacts)
    else:
        # Unknown gate => hard BLOCK (explicit)
        errors = [_make_error("gate_id", "ERR_INVALID_ADMISSION_RULE", variant="detailed")]
        decision, next_state = "BLOCK", None

    return {
        "decision": decision,
        "next_state": next_state,
        "errors": errors,
    }


__all__ = ["evaluate_gate", "EngineResult", "EngineError", "NotImplementedEngine"]

