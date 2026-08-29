# Clone Website: reverse-engineer a site → pixel-perfect Next.js clone

## Использование
```
/clone-website <url1> [<url2> ...]
```

## Аргумент
$ARGUMENTS

## Prerequisites (ОБЯЗАТЕЛЬНО — иначе скилл не запустится)
1. **Browser-automation MCP** (Chrome / Playwright / Browserbase / Puppeteer). В этом харнессе подойдут `qe-browser` (Vibium) или `browser-qa`.
2. **Поднятый scaffold**: Next.js 16 + React 19 + Tailwind v4 + shadcn/ui (`npm run build` должен проходить).

## Действия
1. **Загрузи скилл:** Прочитай `.claude/skills/clone-website/SKILL.md` и следуй ему.
2. Pre-Flight: проверь browser-MCP + сборку scaffold + создай `docs/research/`, `docs/design-references/`.
3. Пофазно (foreman-паттерн): Reconnaissance → Foundation (fonts/colors/assets) → Component Specs (точные CSS) → Parallel Build (builder-агенты в git worktrees) → Assembly + visual-diff QA.
4. Output: pixel-perfect клон + auditable extraction-артефакты в `docs/research/<hostname>/`.

> Imported (MIT) из github.com/JCodesMore/ai-website-cloner-template. Это **реализация-репликация** UI — дополняет `reverse-engineering-unicorn` (бизнес-анализ), а не заменяет.
