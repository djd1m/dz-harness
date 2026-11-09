# Требования

FR-1: отдельный offline fake provider, только синтетические значения, без сети/реальных credentials.
FR-2: один refresh под process lock и повторное чтение состояния, access-only интерфейс.
FR-3: durable intent до вызова provider, результат фиксируется до выдачи.
FR-4: ambiguous/crash/write failure/revoke останавливают автоматический refresh; явный новый fake grant только новым lab instance.
FR-5: реальные multiprocessing tests, повреждение state, права файлов и ошибки не раскрывают синтетические secrets.
FR-6: README с границами, независимое QE другой моделью; не внедрять в Hermes.
