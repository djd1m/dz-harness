# Архитектура проверки

```mermaid
flowchart TD
  S3[Offsite S3 snapshot] --> R[Закрытый restore каталог]
  R --> V[SHA256 и SQLite integrity]
  P[Закреплённый runtime image] --> T[Тестовый контейнер без сети]
  F[Синтетические технические документы] --> T
  T --> C[Core immutable recognized]
  C --> G[Gateway confirmation adapter]
  C --> I[Отдельная проверка индекса]
  O[Offline OAuth fake provider] --> Q[Concurrency и crash tests]
  V --> E[Артефакты приёмки]
  G --> E
  I --> E
  Q --> E
  E --> PR[Draft PR и независимое QE]
```

Стрелки — зависимости проверки, не сетевые подключения. Restore с реальными
данными никогда не монтируется в экспериментальный контейнер. Рабочие сервисы
остаются на прежней версии. Ночная ветка наследует открытый PDF draft PR;
готовность отдельного среза не разрешает автоматически merge всей цепочки.

Исполняемый OAuth ADR находится в соседнем feature hermes-oauth-offline-lab.
Recognized core находится в отдельном worktree dz-harness-health-recognized;
его уточнённый контракт имеет приоритет над первоначальным parent proposal.
Gateway и index acceptance имеют отдельные проверяемые границы. Никакого
автоматического перехода saved → clinically verified → indexed нет.
