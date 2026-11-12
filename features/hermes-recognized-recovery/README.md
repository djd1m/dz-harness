# Проверка recognized export перед восстановлением

Завершён ограниченный read-only этап: внешний trust descriptor/key, exact inventory, проверка core/receipt/source связей на новом пути. Это **не writer и не завершённое восстановление рабочей карты**.

Независимый QE: 19 unit tests PASS, все QE-1–QE-7 закрыты; история дефектов и точные SHA сохранены в `08_qe_report.md`. Реальная synthetic цепочка adapter→core→export→копия на другой inode→verifier прошла; исходные байты/режимы/mtime не меняются. Старый core по-прежнему отказывает новой identity — это ожидаемая граница, а не восстановленная рабочая операция.

- Воспроизведение: `integrations/hermes-health/experiments/recognized-recovery/README.md`.
- Реальный offline integration: `integration_actual.py`, лог `evidence/actual-integration.txt`.
- K2 и amendment-check прошли; последнее лишь находит имена тестов в Python-файле, не доказывает их чувствительность.
- K1 name-check NOT ESTABLISHED: scanner не смог проверить Python workspace; ручной поиск выполнен. Полный native feature-adr/convergence/discrimination PASS не заявляется.
- Следующий отдельный этап: `future/002-proposed-offline-writer.md`. Это предложение, не принятая реализация; writer, seal и activation отсутствуют.

Рабочие контейнеры, медицинская карта, токены и frozen source не менялись. Использовались только синтетические документы и локальный закреплённый Docker image без сети. PR остаётся draft и зависит от родительского PR36; merge/deploy не выполнялись.
