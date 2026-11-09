# Проверка кандидата PDF draft

Режим plain, кодирование Codex; независимый обзор отдельным gpt-6-astra.
Полный feature-adr delivery gate не заявляется. dz statusline использован для
отметки этапа; результаты тестов ниже получены командами, не выведены из панели.

- 67/67 тестов плагина в закреплённом образе Hermes, сеть отключена,
  исходники смонтированы readonly, рабочая карта не смонтирована.
- 14/14 тестов broker: framing, лимиты, malformed JSON, flags и cleanup.
- Реальный Docker broker: технический PDF -> ok + ожидаемый текст;
  повреждённые bytes -> invalid_pdf; timeout -> timeout, оставшихся sandbox нет.
- Полный synthetic broker + адаптер: 2 файла MD/HTML, хеши совпали,
  права0600, исходный manifest не изменился.

## Воспроизведение интеграции

```bash
sudo python3 integrations/hermes-health/pdf-sandbox/integration_smoke.py \
  --parser-image sha256:89499635ad081bd68531310f4d2088ebfd24507ac344601aba9ab2cac298c5b3 \
  --hermes-image sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961
```

Используется локальный Docker daemon; тест не запускает рабочий gateway.
Имена образов выше — фактически проверенные локальные IDs этой установки.
Сборка на другом хосте должна отдельно зафиксировать полученный immutable ID.

## До завершения приёмки

Независимый итоговый обзор; plugin doctor/validate на финальных файлах;
при установке — изоляция systemd/Unix socket и доставка реальных файлов в Mattermost.
Исходники медицинской карты и статусы верификации изменять не требуется.
