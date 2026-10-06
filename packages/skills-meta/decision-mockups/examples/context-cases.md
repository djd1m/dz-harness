# Контекстные примеры v2

Все три случая синтетические. Первые два HTML-фрагмента собираются с настоящими стилями,
панелью и инлайн-пикером page-skeleton.html вместо содержимого .wrap, как в examples/README.md.
Соседний JSON — подготовленный манифест: вставьте его в единственный инертный
script id=decision-manifest type=application/json, экранируя < как \u003c.
Повторная авторская подготовка — check_answer.py --prepare; при получении хеш не исправляется.

## Продукт: заметное изменение экрана

Контекст и основания идут перед выбором; пара экранов меняет только наличие дня.

```json
{
  "components": [
    {
      "id": "list",
      "label": "Список занятий"
    }
  ],
  "context": {
    "constraints": [
      "Сохранить сравнение нескольких занятий."
    ],
    "done": [
      "Подготовлен пример списка из семи занятий."
    ],
    "remaining": [
      "Проверить длинные строки и перенос на телефоне."
    ],
    "requestedAnswer": "Выберите способ показа даты или запросите данные.",
    "risks": [
      "Список с датами станет плотнее."
    ],
    "task": "Помочь ученику сравнить занятия по дате.",
    "unknowns": [
      "Будет ли расписание содержать десятки занятий в день?"
    ],
    "whyNow": "Расположение даты нужно выбрать до изменения списка."
  },
  "date": "06.10.2032",
  "decisions": [
    {
      "id": "date-view",
      "label": "Как показывать дату?",
      "options": [
        {
          "cost": "Учебное условие: один день работы и проверка длинных строк.",
          "id": "row",
          "label": "Дата в каждой строке",
          "whenUseful": "Когда занятия разных дней удобно сравнивать вместе."
        },
        {
          "cost": "Учебное условие: три дня и новый переход между днями.",
          "id": "days",
          "label": "Переключатель дней",
          "whenUseful": "Когда каждый день заполнен десятками занятий."
        }
      ],
      "rationale": "Дата в строке подходит небольшому списку; переключатель полезен при плотном ежедневном расписании.",
      "recommendedOptionId": "row"
    }
  ],
  "grounds": [
    {
      "claim": "В условии семь занятий; день виден только в карточке.",
      "id": "schedule",
      "kind": "fact",
      "source": "Условие синтетического примера 1 в examples/README.md"
    }
  ],
  "pageId": "synthetic-product",
  "revision": "sha256:404c56514318abafd7c364d602fd85c17261c74159c919741980c9b4ad306e80",
  "schemaVersion": 2,
  "topic": "Дата занятия в списке"
}
```

```html
<section class="blk"><h1>Дата занятия в списке</h1><ul data-context="constraints"><li>Сохранить сравнение нескольких занятий.</li></ul>
<ul data-context="done"><li>Подготовлен пример списка из семи занятий.</li></ul>
<ul data-context="remaining"><li>Проверить длинные строки и перенос на телефоне.</li></ul>
<p data-context="requestedAnswer">Выберите способ показа даты или запросите данные.</p>
<ul data-context="risks"><li>Список с датами станет плотнее.</li></ul>
<p data-context="task">Помочь ученику сравнить занятия по дате.</p>
<ul data-context="unknowns"><li>Будет ли расписание содержать десятки занятий в день?</li></ul>
<p data-context="whyNow">Расположение даты нужно выбрать до изменения списка.</p><p data-ground-id="schedule" data-evidence-kind="fact" data-source="Условие синтетического примера 1 в examples/README.md">fact: В условии семь занятий; день виден только в карточке. Источник: Условие синтетического примера 1 в examples/README.md</p><p data-component-id="list">Список занятий</p><div class="mock-pair"><figure><span class="mock-cap bad">Как сейчас</span><div class="mock-scroll"><div class="browser"><p class="mrow">Акварель · 10:30</p></div></div><figcaption>День нужно искать внутри карточки.</figcaption></figure><figure><span class="mock-cap good">После починки</span><div class="mock-scroll"><div class="browser"><p class="mrow">Акварель · 6 мая · 10:30</p></div></div><figcaption>Смотрите на дату рядом со временем.</figcaption></figure></div><div class="qcard"><p class="rec">Цена зависит от выбранного пути; сравните последствия ниже.</p><div class="picks" data-group="date-view" data-label="Как показывать дату?" role="group" aria-label="Как показывать дату?"><h3 data-decision-label>Как показывать дату?</h3><p data-rationale>Дата в строке подходит небольшому списку; переключатель полезен при плотном ежедневном расписании.</p><button type="button" class="pickopt suggest" data-option-id="row" data-val="Дата в каждой строке"><span data-option-label>Дата в каждой строке</span><span data-cost>Учебное условие: один день работы и проверка длинных строк.</span><span data-whenuseful>Когда занятия разных дней удобно сравнивать вместе.</span></button>
<button type="button" class="pickopt" data-option-id="days" data-val="Переключатель дней"><span data-option-label>Переключатель дней</span><span data-cost>Учебное условие: три дня и новый переход между днями.</span><span data-whenuseful>Когда каждый день заполнен десятками занятий.</span></button><button type="button" data-answer-state="deferred">Отложить</button><button type="button" data-answer-state="needs-data">Нужны данные</button><button type="button" data-answer-state="unanswered">Нет ответа</button></div></div></section>
```

## Сервер: порядок доставки и граница

Здесь различаются порядок и поведение при отказе, поэтому одинаковые экраны не помогают.
Контекст экспорта сохраняет непроверенный поток, оставшуюся проверку повторов и второй вопрос.

```json
{
  "components": [
    {
      "id": "queue",
      "label": "Очередь заявок"
    },
    {
      "id": "worker",
      "label": "Обработчик"
    }
  ],
  "context": {
    "constraints": [
      "Без нового сервиса для пробного запуска."
    ],
    "done": [
      "Описан путь заявки."
    ],
    "remaining": [
      "Проверить повторную доставку и измерить скорость."
    ],
    "requestedAnswer": "Ответьте отдельно на оба вопроса.",
    "risks": [
      "Повторная доставка может дублировать результат."
    ],
    "task": "Выбрать обработку заявок перед пробным запуском.",
    "unknowns": [
      "Предполагаемые 20–40 заявок в минуту не проверены; очередь может расти."
    ],
    "whyNow": "Способ обработки определяет проверку отказов."
  },
  "date": "06.10.2032",
  "decisions": [
    {
      "excludedAlternatives": [
        {
          "assumptions": [
            "Заявка требует явного результата."
          ],
          "label": "Молча терять заявки",
          "reason": "Не выполняет требование сохранения."
        }
      ],
      "id": "delivery",
      "label": "Как доставлять заявки?",
      "options": [
        {
          "cost": "Нужно проверить повторы и задержку.",
          "id": "queued",
          "label": "A — Через очередь",
          "whenUseful": "Если остановка обработчика не должна терять заявки."
        },
        {
          "cost": "Ошибка обработчика возвращается отправителю.",
          "id": "direct",
          "label": "B — Прямым вызовом",
          "whenUseful": "Если отправитель умеет повторять и важен немедленный ответ."
        }
      ],
      "rationale": "Очередь сохраняет заявку при остановке обработчика; прямой вызов проще при малом потоке.",
      "recommendedOptionId": "queued"
    },
    {
      "id": "failure",
      "label": "Как сообщать об отказе?",
      "options": [
        {
          "cost": "Нужен экран статуса.",
          "id": "status",
          "label": "A — Показывать статус",
          "whenUseful": "Если пользователь возвращается за результатом."
        },
        {
          "cost": "Нужно согласие на уведомление.",
          "id": "notify",
          "label": "B — Уведомлять отдельно",
          "whenUseful": "Если ожидание длительное."
        }
      ],
      "rationale": "Оба способа жизнеспособны; данных о привычках пользователя пока нет.",
      "recommendedOptionId": null
    }
  ],
  "grounds": [
    {
      "basis": "Диапазон для проверки двух сценариев; замеров нет.",
      "claim": "20–40 заявок в минуту — учебное предположение.",
      "id": "load",
      "kind": "estimate",
      "source": "не проверено"
    }
  ],
  "pageId": "synthetic-backend",
  "revision": "sha256:835028e3bda29e97c01c04f986e5c213419526acf5fb6e419f8f0b7944f6f628",
  "schemaVersion": 2,
  "topic": "Очередь заявок"
}
```

```html
<section class="blk"><h1>Очередь заявок</h1><ul data-context="constraints"><li>Без нового сервиса для пробного запуска.</li></ul>
<ul data-context="done"><li>Описан путь заявки.</li></ul>
<ul data-context="remaining"><li>Проверить повторную доставку и измерить скорость.</li></ul>
<p data-context="requestedAnswer">Ответьте отдельно на оба вопроса.</p>
<ul data-context="risks"><li>Повторная доставка может дублировать результат.</li></ul>
<p data-context="task">Выбрать обработку заявок перед пробным запуском.</p>
<ul data-context="unknowns"><li>Предполагаемые 20–40 заявок в минуту не проверены; очередь может расти.</li></ul>
<p data-context="whyNow">Способ обработки определяет проверку отказов.</p><p data-ground-id="load" data-evidence-kind="estimate" data-source="не проверено">estimate: 20–40 заявок в минуту — учебное предположение. Источник: не проверено База оценки: Диапазон для проверки двух сценариев; замеров нет.</p><p data-component-id="queue">Очередь заявок</p><p data-component-id="worker">Обработчик</p><div class="diagram-scroll" tabindex="0" role="region" aria-label="Путь заявки через очередь" data-diagram="sequence" aria-describedby="queue-text"><ol class="diagram-flow"><li>Отправитель →</li><li><span data-component-id="queue">Очередь заявок</span> →</li><li><span data-component-id="worker">Обработчик</span></li></ol></div><p id="queue-text" data-diagram-text>Отправитель сначала сохраняет заявку в «Очередь заявок». Затем «Обработчик» забирает её. При остановке обработчика заявка остаётся в очереди; повторную доставку нужно проверить. При прямом вызове ошибка сразу возвращается отправителю, который сам решает, повторять ли запрос.</p><div class="diagram-scroll" tabindex="0" role="region" aria-label="Граница обработчика" data-diagram="components" aria-describedby="boundary-text"><div class="diagram-boundary"><p>Внутри границы: <span data-component-id="worker">Обработчик</span></p><p>За границей: <span data-component-id="queue">Очередь заявок</span></p></div></div><p id="boundary-text" data-diagram-text>«Очередь заявок» хранит вход отдельно от «Обработчик». Граница позволяет остановить обработчик без удаления входа. Эта граница не предотвращает дубли результатов: обработка повторов остаётся отдельной работой.</p><details><summary>Дополнительные условия оценки</summary><p>Диапазон нужен для учебного сравнения. Перед запуском требуются замеры.</p><a href="#queue-text">К текстовому объяснению</a></details><div class="qcard"><p class="rec">Цена зависит от выбранного пути; сравните последствия ниже.</p><div class="picks" data-group="delivery" data-label="Как доставлять заявки?" role="group" aria-label="Как доставлять заявки?"><h3 data-decision-label>Как доставлять заявки?</h3><p data-rationale>Очередь сохраняет заявку при остановке обработчика; прямой вызов проще при малом потоке.</p><button type="button" class="pickopt suggest" data-option-id="queued" data-val="A — Через очередь"><span data-option-label>A — Через очередь</span><span data-cost>Нужно проверить повторы и задержку.</span><span data-whenuseful>Если остановка обработчика не должна терять заявки.</span></button>
<button type="button" class="pickopt" data-option-id="direct" data-val="B — Прямым вызовом"><span data-option-label>B — Прямым вызовом</span><span data-cost>Ошибка обработчика возвращается отправителю.</span><span data-whenuseful>Если отправитель умеет повторять и важен немедленный ответ.</span></button><button type="button" data-answer-state="deferred">Отложить</button><button type="button" data-answer-state="needs-data">Нужны данные</button><button type="button" data-answer-state="unanswered">Нет ответа</button></div></div>
<div class="qcard"><p class="rec">Цена зависит от выбранного пути; сравните последствия ниже.</p><div class="picks" data-group="failure" data-label="Как сообщать об отказе?" role="group" aria-label="Как сообщать об отказе?"><h3 data-decision-label>Как сообщать об отказе?</h3><p data-rationale>Оба способа жизнеспособны; данных о привычках пользователя пока нет.</p><button type="button" class="pickopt" data-option-id="status" data-val="A — Показывать статус"><span data-option-label>A — Показывать статус</span><span data-cost>Нужен экран статуса.</span><span data-whenuseful>Если пользователь возвращается за результатом.</span></button>
<button type="button" class="pickopt" data-option-id="notify" data-val="B — Уведомлять отдельно"><span data-option-label>B — Уведомлять отдельно</span><span data-cost>Нужно согласие на уведомление.</span><span data-whenuseful>Если ожидание длительное.</span></button><button type="button" data-answer-state="deferred">Отложить</button><button type="button" data-answer-state="needs-data">Нужны данные</button><button type="button" data-answer-state="unanswered">Нет ответа</button></div></div></section>
```

## Компактно: два вопроса с повторяющимися A/B

```json
{
  "components": [
    {
      "id": "queue",
      "label": "Очередь заявок"
    },
    {
      "id": "worker",
      "label": "Обработчик"
    }
  ],
  "context": {
    "constraints": [
      "Без нового сервиса для пробного запуска."
    ],
    "done": [
      "Описан путь заявки."
    ],
    "remaining": [
      "Проверить повторную доставку и измерить скорость."
    ],
    "requestedAnswer": "Назовите каждый вопрос и полный вариант или состояние.",
    "risks": [
      "Повторная доставка может дублировать результат."
    ],
    "task": "Выбрать обработку заявок перед пробным запуском.",
    "unknowns": [
      "Предполагаемые 20–40 заявок в минуту не проверены; очередь может расти."
    ],
    "whyNow": "Способ обработки определяет проверку отказов."
  },
  "date": "06.10.2032",
  "decisions": [
    {
      "excludedAlternatives": [
        {
          "assumptions": [
            "Заявка требует явного результата."
          ],
          "label": "Молча терять заявки",
          "reason": "Не выполняет требование сохранения."
        }
      ],
      "id": "delivery",
      "label": "Как доставлять заявки?",
      "options": [
        {
          "cost": "Нужно проверить повторы и задержку.",
          "id": "queued",
          "label": "A",
          "whenUseful": "Если остановка обработчика не должна терять заявки."
        },
        {
          "cost": "Ошибка обработчика возвращается отправителю.",
          "id": "direct",
          "label": "B",
          "whenUseful": "Если отправитель умеет повторять и важен немедленный ответ."
        }
      ],
      "rationale": "Очередь сохраняет заявку при остановке обработчика; прямой вызов проще при малом потоке.",
      "recommendedOptionId": "queued"
    },
    {
      "id": "failure",
      "label": "Как сообщать об отказе?",
      "options": [
        {
          "cost": "Нужен экран статуса.",
          "id": "status",
          "label": "A",
          "whenUseful": "Если пользователь возвращается за результатом."
        },
        {
          "cost": "Нужно согласие на уведомление.",
          "id": "notify",
          "label": "B",
          "whenUseful": "Если ожидание длительное."
        }
      ],
      "rationale": "Оба способа жизнеспособны; данных о привычках пользователя пока нет.",
      "recommendedOptionId": null
    }
  ],
  "grounds": [
    {
      "basis": "Диапазон для проверки двух сценариев; замеров нет.",
      "claim": "20–40 заявок в минуту — учебное предположение.",
      "id": "load",
      "kind": "estimate",
      "source": "не проверено"
    }
  ],
  "pageId": "synthetic-compact",
  "revision": "sha256:bceb2ef0cc33a5ad686e79d08eea2d3c778d4dfccd895634c8b081d6d20778a4",
  "schemaVersion": 2,
  "topic": "Два коротких вопроса"
}
```

```text
Два коротких вопроса · 06.10.2032
Задача: выбрать обработку заявок перед пробным запуском.
Сделано: описан путь заявки. Осталось: проверить повторы и измерить скорость.
Почему сейчас: способ обработки определяет проверку отказов. Ограничение: без нового сервиса.
Риск: повторная доставка дублирует результат. Неизвестное: 20–40 заявок в минуту не проверены;
это диапазон учебного сравнения, а не замер. Источник: не проверено.
Как доставлять заявки? A — очередь с проверкой повторов; B — прямой вызов с ошибкой отправителю.
Почему A: заявка переживает остановку обработчика. Когда B: отправитель умеет повторять.
Как сообщать об отказе? A — статус (нужен экран); B — уведомление (нужно согласие).
Рекомендации пока нет: неизвестны привычки пользователя.
Полные названия вариантов в обоих вопросах: «A», «B».
Состояния для каждого вопроса: «Отложить», «Нужны данные: [вопрос]», «Нет ответа».
Страница: synthetic-compact
Версия: sha256:bceb2ef0cc33a5ad686e79d08eea2d3c778d4dfccd895634c8b081d6d20778a4
Выбор не означает выполнение.
Ответьте названием вопроса и полным названием варианта; либо напишите «Отложить»,
«Нужны данные: [вопрос]» или «Нет ответа» для указанного вопроса.
```

Ответ «Как доставлять заявки? — A; Как сообщать об отказе? — Отложить» однозначен
в этой показанной версии. Агент составляет selected для delivery/queued и deferred для failure.
«Как сообщать об отказе? — Нужны данные: нужен ли экран статуса?» сохраняет заметку дословно.
Пропущенный вопрос и «Нет ответа» остаются unanswered. «A», «да», «рекомендация» без вопроса
требуют уточнения; при повторяющихся полных названиях вопросов уточнение тоже необходимо.
Без записанной показанной pageId/revision агент не связывает согласие. Старую показанную
revision нельзя заменить текущей; реальный получатель отвергнет устаревший envelope.

Компактный путь не требует HTML, CSS, artifact-design или check_page.py. Подготовка и приём
используют check_answer.py, а смысл проверяется отдельно: задача/статус/почему сейчас/цена/
источники/неизвестное видны; обе ветки полезны при названных условиях; инструкция однозначна.
Человек не пишет JSON и не копирует хеш. Машинная передача — отдельный полный JSON документ,
не JSON, найденный среди цитат или подписей. Нет доверенного текущего манифеста — проверка ожидает.
