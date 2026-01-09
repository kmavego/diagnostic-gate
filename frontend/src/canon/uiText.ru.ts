// frontend/src/canon/uiText.ru.ts
/**
 * Diagnostic Gate — UI Canon (RU)
 * Тексты в этом файле считаются каноническими для траектории B (Product for experts).
 * Не менять формулировки без пересмотра Product Canon.
 */

export const UI_TEXT_RU = Object.freeze({
  app: {
    name: "Diagnostic Gate",
  },

  contract: {
    title: "Контракт предъявления артефактов",
    show: "Показать контракт Gate",
    errorTitle: "Ошибка получения контракта Gate",
  },

  common: {
    back: "К проектам",
    open: "Открыть",
    refreshList: "Обновить список",
    refreshDetail: "Обновить запись",
    loading: "Загрузка…",
    dash: "—",
  },

  projects: {
    title: "Проекты под допускным контролем",
    createTitle: "Регистрация проекта для допуска",
    namePlaceholder: "Название (необязательно)",
    createCta: "Зарегистрировать",
    creating: "Регистрация…",
    listTitle: "Проекты",
    empty: "Проекты отсутствуют.",
    listUnavailable: "Список проектов недоступен (или endpoint отсутствует).",
    row: {
      state: "Состояние допуска",
      createdAt: "Создан",
      audit: "Аудит",
    },
  },

  admission: {
    title: "Запрос решения Gate",
    subtitle: "Предъявите артефакты строго по контракту текущего Gate. Решение может быть: ДОПУСК / ОТКАЗ.",
    artifactsTitle: "Артефакты проекта (доказательная база для решения Gate)",
    artifactsHint: "Оценивается только представленное содержимое. Система не дополняет и не исправляет артефакты.",
    submit: "Запросить решение Gate",
    submitHint: "Результат может быть: ОТКАЗ В ДОПУСКЕ.",
    artifactsFieldLabel: "Артефакты (JSON)",
  },

  decision: {
    title: "Решение Gate",
    deniedTitle: "ДОПУСК ЗАПРЕЩЁН",
    grantedTitle: "ДОПУСК РАЗРЕШЁН",
    fields: {
      submission: "Submission",
      gate: "Gate",
      decision: "Решение",
      violation: "Код нарушения",
      canon: "Версия канона",
      stateBefore: "Состояние до",
      stateAfter: "Состояние после",
    },
    deniedHint: "Проект не может перейти в следующее состояние до устранения нарушения и повторной подачи.",
    grantedHint: "Проекту разрешено перейти в следующее состояние допуска.",
    raw: {
      show: "Показать raw-ответ",
      hide: "Скрыть raw-ответ",
    },
    errors: {
      title: "Нарушения (errors)",
      empty: "Нарушения отсутствуют.",
    },
  },

  audit: {
    title: "Протокол решений (аудит)",
    header: {
      project: "Проект",
      submission: "Submission",
    },
    links: {
      backToProject: "← к проекту",
      backToList: "← к журналу допуска",
    },
    list: {
      title: "Записи (submissions)",
      empty: "Записей пока нет.",
      rawList: {
        summary: "Показать raw-ответ списка",
        label: "raw list payload",
      },
      table: {
        createdAt: "created_at",
        decision: "decision",
        gateId: "gate_id",
        gateVersion: "gate_version",
        stateBefore: "state_before",
        stateAfter: "state_after",
        submissionId: "submission_id",
      },
    },
    detail: {
      title: "Неподвижная запись допуска (immutable record)",
      loadingEmpty: "Запись не загружена.",
      sections: {
        snapshot: "Неподвижный снимок",
        sent: "Что было предъявлено",
        returned: "Что вернул движок",
        rawSnapshots: "Raw-снимки",
      },
      sentHint: "request.artifacts",
      returnedHint: "result (decision, errors, meta)",
      rawSnapshotsHint: "Без интерпретации. Протокол как есть.",
      immutability: "immutability",
      rawRequest: "raw request",
      rawResult: "raw result",
      artifacts: "artifacts",
    },

    errors: {
      listError: "ошибка списка аудита",
      detailError: "ошибка записи аудита",
    },
  },
} as const);

export type UiTextRu = typeof UI_TEXT_RU;
