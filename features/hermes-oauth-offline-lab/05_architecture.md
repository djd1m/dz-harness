# Архитектура лабораторной модели

Caller -> owner(state directory) -> injected fake provider.
Owner использует локальный flock, re-read, durable intent. State private0700,
файлы0600; temp O_EXCL/O_NOFOLLOW, replace и fsync. Provider хранит отдельный
синтетический ledger, сериализованный его lock, чтобы multiprocessing тест
измерял реальную одну ротацию. Ошибки только фиксированными кодами.

После любого ambiguous исхода нет сетевого retry. Новый owner-процесс видит
intent/uncertain и отказывает. Дополнительный poison marker требуется для
fsync результата: rename мог уже заменить intent, но durability неизвестна.
Консервативный порядок отдельного durable pending marker позволит закрыть
выдачу даже если state file уже ready, пока marker не снят после commit.
Если marker removal fsync не подтверждён — текущий вызов отказывает; restart
на локальной FS читает реально оставшееся состояние, crash-proof свойства
при физическом power loss этой тестовой моделью не доказаны.
