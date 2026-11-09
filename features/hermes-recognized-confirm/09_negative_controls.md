# Ручные negative controls

2026-11-09, независимый reviewer Codex gpt-6-astra.

**MEASURED: три выбранных negative control сработали.** Для каждого исходный тест прошёл, а копия реализации с одной отключённой проверкой получила настоящий `unittest` assertion failure. Это manual controlled mutation evidence, **не PASS native discrimination gate и не полное mutation coverage**.

Native `dz` результат остаётся `CANNOT_ISOLATE`, `measurementValid:false`: классификатор не поддерживает вывод Python unittest. Исходный результат сохранён в [discrimination-not-established.json](evidence/discrimination-not-established.json). TAP не имитировался; `dz` не изменялся.

## Область и результаты

Baseline HEAD: `7e52befcb1fbb3c2544e38eecebff33728a029a7`.

- `recognized_confirm.py`: SHA-256 `05b4022f2ee785f53c2236314578ca874fd9408d4e65730ba19a88cdacfba366`.
- `tests/test_recognized_confirm.py`: SHA-256 `4e803601355437b856bada092fb118234f4c64ae2caa13975d717f39c6d862b8`.

Все имена тестов ниже имеют префикс `test_recognized_confirm.StateTests.`. Тесты оставлены без изменений.

| Контроль | Единственное изменение реализации в копии | Реальный тест | Baseline | Mutant |
| --- | --- | --- | --- | --- |
| Command authority | `if _authority is not _COMMAND_AUTHORITY` заменён на `if False` | `test_command_boundary` | PASS, exit 0 | FAIL, exit 1: `AssertionError: Refusal not raised` |
| Exact source bytes | Условие `digest(raw) != source['sha256'] or len(raw) != source['bytes']` заменено на `False` | `test_snapshot_rejects_source_and_workspace_drift` | PASS, exit 0 | FAIL, exit 1 в subtest `source_drift`: `Refusal not raised` |
| Runtime pin | Из условия `side != receipt['sidecar'] or runtime_identity(tools) != receipt['runtime']` удалено только сравнение runtime; sidecar comparison сохранено | `test_runtime_drift` | PASS, exit 0 | FAIL, exit 1: `AssertionError: Refusal not raised` |

Каждый запуск исполнил ровно один выбранный unittest. Ни один mutant не был засчитан по import/setup error: логи содержат `FAIL`, `AssertionError` и `Ran 1 test`, без `ERROR`. В source-тесте остальные subtests не подменялись. Property command authority проверяет внутреннюю границу вызова команды без capability, а не фактический Mattermost transport или всю модель consent. Runtime test использует предусмотренный исходным тестом mock identity, а не реальное обновление runtime package.

## Воспроизводимость и изоляция

Шесть финальных запусков (baseline + mutant для каждого контроля) использовали отдельные disposable копии integration под private каталогом `/tmp/recognized-mutants-*`, mode0700, UID/GID1000:1001. Репозиторные source/tests не менялись. После каждого baseline в соответствующей копии менялось ровно одно условие; все остальные файлы оставались baseline.

Docker image: `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`; `--network none --user 1000:1001 --read-only --init`; tmpfs `/test:rw,exec,mode=0700,uid=1000,gid=1001`; `HOME=TMPDIR=/test`, `HERMES_HOME=/test/hermes`, `PYTHONPATH=/opt/hermes:/plugin/tests`. Только disposable integration смонтирована read-only в `/plugin`; production/core/medical volumes не подключались. Entry point `python3 -B -m unittest -v <точное имя теста>`.

[Агрегированные измерения](evidence/manual-negative-controls.json) содержат команды всех шести запусков, hashes baseline/mutants и неизменного теста, exit codes и конкретно отключённые проверки. [Полный короткий unittest log](evidence/manual-negative-controls.txt) содержит реальные assertion traces. Никакие секреты или медицинские данные не использовались.

Этот результат подтверждает чувствительность трёх существующих тестов к трём конкретным регрессиям. Receipt HMAC, другие ветви consent, взаимодействия нескольких дефектов и полный набор возможных mutations здесь не измерялись. Полный набор 109 тестов на каждом mutant не запускался. Ограничения native gate, production transport и родительского L signoff остаются в силе.
