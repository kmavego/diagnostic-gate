# Diagnostic Gate

Diagnostic Gate — это контрактно-ориентированная система методологической валидации.
Проект не обучает и не интерпретирует решения пользователя — он **блокирует запуск
некорректно спроектированных образовательных продуктов** через формализованные гейты.

Ключевая идея:  
**ценность = право сказать «нельзя»**, подкреплённое воспроизводимым протоколом.

---

## What Diagnostic Gate Is Not

Чтобы избежать неверных ожиданий, важно зафиксировать границы:

- это **не** образовательная платформа;
- это **не** AI-ассистент и не «умный советчик»;
- это **не** система рекомендаций;
- это **не** UX-wizard и не продуктовый конструктор.

Diagnostic Gate не улучшает проект —  
он **разрешает или запрещает** движение дальше.

---

## Development

This project follows **PEP 668**.  
Use a virtual environment for installing dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Run tests: `pytest -q` (after activating `.venv`).

Тесты являются gate-механизмом.
Зелёные тесты означают, что зафиксированный контракт не нарушен.

## Canon

This project is governed by a strict internal canon.
Any change that violates the canon is considered a product bug.

Канон определяет:
- продуктовые границы,
- поведение engine,
- допустимый UX,
- формат аудита решений.

Любое изменение, нарушающее канон, считается product bug —
даже если код компилируется и интерфейс выглядит «удобно».

### Canon documents
- Product scope & non-goals: docs/canon/product.md
- Engine & state machine: docs/canon/engine.md
- UX Gate Page canon: docs/canon/ux-gate-page.md
- UX Audit Page canon: docs/canon/ux-audit-page.md

## API Contract
### Frozen API (v0.1)

Канонический замороженный OpenAPI-контракт: openapi/openapi.v0.1.yaml

Свойства:
- контракт заморожен;
- охраняется contract-tests;
- любые breaking-изменения запрещены;
- engine vocabulary сохраняется как есть (stringly-typed).

## Audit Contract

Аддитивный контракт аудита: openapi/audit.v0.1.yaml

Назначение:
- история решений (submissions);
- воспроизводимость и трассируемость;
- immutable-снимки request/result.

### Ограничения:
- не является частью frozen v0.1;
- не охраняется текущими contract-tests;
- используется как основа следующего этапа продукта.

## Repository Structure (high-level)
```text
.
├── backend/            # FastAPI backend
├── engine/             # Gate engine & evaluators
├── frontend/           # Thin frontend client
├── openapi/            # Canonical API contracts
│   ├── openapi.v0.1.yaml
│   └── audit.v0.1.yaml
├── docs/
│   └── canon/          # Product, engine and UX canons
├── tests/              # Gate & engine tests
└── README.md
```

## Testing Philosophy

- Тесты — не QA-инструмент, а часть системы управления.
- Contract-tests защищают границы API.
- Engine-tests защищают семантику решений.
- Если тест падает — система считается некорректной,
независимо от UI, UX или бизнес-аргументов.

## Current Status
- Backend MVP: готов
- OpenAPI v0.1: заморожен
- Frontend thin client: реализован
- Audit contract: зафиксирован (additive)
- Следующий этап: backend audit endpoints + продуктовая AuditPage
