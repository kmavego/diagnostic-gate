# Changelog

## v0.1.2 — 2026-01-13

### Added
- Product UX: prefill формы из последнего immutable submission (best-effort, только до первого ввода пользователя).
- Frontend: read-only helpers для получения artifacts из latest submission через audit endpoints.

### Fixed
- Frontend build: совместимость с TS target (без String.replaceAll).
- UI: DecisionBlock приведён к типам Decision и nullability (next_state).

## v0.1.1 — Product UX Phase 1.1
- StructuredError.meta (UI binding: ui_field_id / ui_field_ids / ui_block_id)
- UI Schema v1 (product mode), additive to frozen OpenAPI v0.1
- Frontend audit/product switch stabilized
- Strict OpenAPI v0.1 compliance preserved
- Contract tests: 40 passed

