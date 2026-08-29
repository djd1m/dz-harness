#!/usr/bin/env bash
# Pre-commit hook: triple-check на staged .md файлах
#
# Реализует 3-pillar discipline (triple-pillar shard / governance protocol):
# каждый factual claim должен иметь inline-ссылку на ADR / methodology /
# research / внешний верифицированный источник.
#
# Режимы (через env var TRIPLE_CHECK_MODE):
#   advisory  — печатает warning, не блокирует (default)
#   strict    — блокирует commit при MISSING > MISSING_THRESHOLD
#
# Вызов:
#   pre-commit-triple-check.sh                          — проверить staged .md
#   pre-commit-triple-check.sh --advisory-single FILE   — проверить один файл,
#       always advisory, always exit 0 (для Claude Code PostToolUse hook)
#
# Установка: см. README.md в этом каталоге (секция «Установка»)
#   или hooks.json (секция git_hooks).
#
# NB: claim-детекция — эвристика (advisory tool, не precision instrument).
# Двухстадийная: строка считается claim'ом если содержит цифру И один из
# маркеров (%, валюта, единица, ratio, decimal). POSIX-safe regex (без \s \. \$).

set -euo pipefail

MODE="${TRIPLE_CHECK_MODE:-advisory}"
MISSING_THRESHOLD="${TRIPLE_CHECK_MISSING_THRESHOLD:-3}"

# ─── Аргументы ──────────────────────────────────────────────────────────
SINGLE_FILE=""
if [[ "${1:-}" == "--advisory-single" ]]; then
  SINGLE_FILE="${2:-}"
  MODE="advisory"
  [[ "$SINGLE_FILE" != *.md ]] && exit 0
  [[ ! -f "$SINGLE_FILE" ]] && exit 0
fi

# source = inline markdown link на pillar-путь или внешний URL
SOURCE_RE='\[.+\]\((https?://|\.\./adrs/|\.\./methodologies/|\.\./researches/|adrs/|methodologies/|researches/)'

# ─── Список файлов для проверки ─────────────────────────────────────────
if [[ -n "$SINGLE_FILE" ]]; then
  FILES="$SINGLE_FILE"
else
  FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.md$' || true)
  # Исключения: wiki-backlinks.md, wiki/concepts/* (auto-generated), .claude/**
  FILES=$(echo "$FILES" | grep -v 'wiki-backlinks\.md$' | grep -v '^wiki/concepts/' | grep -v '^\.claude/' || true)
fi

if [[ -z "$FILES" ]]; then
  exit 0
fi

TOTAL_MISSING=0
FILES_WITH_ISSUES=0

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🔍 TRIPLE-CHECK hook (mode=$MODE${SINGLE_FILE:+, single-file})"
echo "════════════════════════════════════════════════════════════════"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ ! -f "$file" ]] && continue

  # staged-версия (если в staged-режиме), иначе working tree
  if [[ -n "$SINGLE_FILE" ]]; then
    CONTENT=$(cat "$file")
  else
    CONTENT=$(git show :"$file" 2>/dev/null || cat "$file")
  fi

  # Heuristic: claim = строка с цифрой И маркером (%, валюта, единица, ratio,
  # decimal). Игнорируем code blocks, YAML frontmatter, wiki:see-also, headings.
  # POSIX-safe regex: [[:space:]], [.], [$] — без \s \. \$.
  CLAIM_LINES=$(echo "$CONTENT" | awk '
    BEGIN { in_code=0; in_yaml=0; in_wiki=0; first=1 }
    /^---$/ {
      if (first) { in_yaml=1; first=0 }
      else if (in_yaml) { in_yaml=0 }
      next
    }
    /^```/ { in_code = !in_code; next }
    /<!-- wiki:see-also-start -->/ { in_wiki=1; next }
    /<!-- wiki:see-also-end -->/ { in_wiki=0; next }
    in_code || in_yaml || in_wiki { next }
    /^[ \t]*#/ { next }
    /[0-9]/ {
      if ($0 ~ /[0-9][[:space:]]*%/ ||
          $0 ~ /[$€₽]/ ||
          $0 ~ /[0-9][[:space:]]*(ms|мс|сек|мин|час|ч |ГБ|GB|ТБ|TB|млрд|млн|тыс|руб|год|года|лет|дн)/ ||
          $0 ~ /[0-9][[:space:]]*[xх]([[:space:]]|$|[.,)])/ ||
          $0 ~ /[0-9][.][0-9]/)
        print
    }
  ' || true)

  CLAIM_COUNT=$(echo "$CLAIM_LINES" | grep -c . || true)
  MISSING_LINES=$(echo "$CLAIM_LINES" | grep -vE "$SOURCE_RE" | grep -v '^[[:space:]]*$' || true)
  MISSING=$(echo "$MISSING_LINES" | grep -c . || true)

  if [[ "$MISSING" -gt 0 ]]; then
    FILES_WITH_ISSUES=$((FILES_WITH_ISSUES + 1))
    TOTAL_MISSING=$((TOTAL_MISSING + MISSING))
    echo ""
    echo "  📄 $file"
    echo "     claims: $CLAIM_COUNT, MISSING source: $MISSING"
    echo "     первые 3 строки без source:"
    echo "$MISSING_LINES" | head -3 | sed 's/^/        > /'
  fi
done <<< "$FILES"

echo ""
echo "────────────────────────────────────────────────────────────────"
if [[ "$TOTAL_MISSING" -eq 0 ]]; then
  echo "✅ TRIPLE_CHECK_PASSED — все факты с inline-источниками"
  echo "════════════════════════════════════════════════════════════════"
  exit 0
fi

echo "⚠️  Files with potential issues: $FILES_WITH_ISSUES"
echo "⚠️  Total claims without inline source: $TOTAL_MISSING"
echo "    (threshold for strict mode: $MISSING_THRESHOLD)"
echo ""

if [[ "$MODE" == "strict" && "$TOTAL_MISSING" -gt "$MISSING_THRESHOLD" ]]; then
  echo "❌ TRIPLE_CHECK_FAILED (strict mode — MISSING $TOTAL_MISSING > threshold $MISSING_THRESHOLD)"
  echo "   Добавьте inline-ссылки на ADR / methodology / research / external URL"
  echo "   или установите TRIPLE_CHECK_MODE=advisory для пропуска (не рекомендуется)"
  echo "   Подробнее: документация команды /triple-check"
  echo "════════════════════════════════════════════════════════════════"
  exit 1
fi

if [[ "$MODE" == "strict" ]]; then
  echo "ℹ️  TRIPLE_CHECK_WARN (strict mode — MISSING $TOTAL_MISSING ≤ threshold $MISSING_THRESHOLD, commit пропущен)"
else
  echo "ℹ️  TRIPLE_CHECK_WARN (advisory mode — commit пропущен)"
  echo "   Для строгого режима: TRIPLE_CHECK_MODE=strict git commit ..."
fi
echo "════════════════════════════════════════════════════════════════"
exit 0
