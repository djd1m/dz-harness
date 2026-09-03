# Интерактивный курс: harness-architecture

Курс в стиле Head First о верхнеуровневом устройстве dz-harness-hub — и одновременно
разводящая страница ко всем сорока обучалкам харнесса.
Опорный пакет: [@dzhechkov/harness-cli](https://www.npmjs.com/package/@dzhechkov/harness-cli).
12 разделов, упражнения шести типов, финальный тест, достижения. Русский язык.

**Как открыть:** скачайте `index.html` (кнопка *Download raw file*) и откройте в браузере.
Файл самодостаточен — без сети, без установки; прогресс сохраняется локально в вашем браузере.

Курс построен ТОЛЬКО на тех частях документа `docs/architecture/harness-hub-architecture.ru.md`,
которые выдержали независимую проверку; открытые преувеличения из
`docs/architecture/reassessment-2026-09-03/_a-final3.md` в него не вошли. Счётные величины
получены генератором `scripts/arch-snapshot-counts.mjs` на закреплённом снимке `a10241d1`.

`course.json` — исходные данные курса (формат edu-site Step-0). Курс собран фабрикой
[@dzhechkov/skills-tutorial-factory](https://www.npmjs.com/package/@dzhechkov/skills-tutorial-factory):
структура проверена детерминированным гейтом (15 свойств), сайт — поведенческой верификацией.
