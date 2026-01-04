# Tests

Цель набора тестов:
1) Не дать канону «расползтись» (корпус, registry, UX-коды, файлы Gate).
2) Подготовить вход для настоящих engine-тестов, когда появится evaluator.

Что тестируем сейчас (без движка):
- corpus/*.examples.yaml корректно структурированы и ссылаются на существующие error_code
- ux_messages.yaml содержит все error_code из корпуса
- gates_registry.yaml и nds_state_machine.yaml согласованы
- Gate YAML содержат обязательные поля (gate_id/version/artifacts/gates/transition)

Что тестируем позже (с движком):
- каждый кейс из corpus даёт PASS/BLOCK как expected
- список error_code совпадает
- next_state соответствует state machine

