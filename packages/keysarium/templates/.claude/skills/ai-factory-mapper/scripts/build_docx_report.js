#!/usr/bin/env node
/**
 * build_docx_report.js — генератор финального DOCX-отчёта для ai-factory-mapper.
 *
 * Использование:
 *   node build_docx_report.js <input.json> <output.docx>
 *
 * Ожидаемая структура input.json:
 * {
 *   "title": "Анализ покрытия [...]",
 *   "subtitle": "опционально",
 *   "date": "16 апреля 2026",
 *   "catalog_version": "2026-04-16 + web_search",
 *   "executive_summary": {
 *     "tldr": "...",
 *     "key_findings": ["...", "..."]
 *   },
 *   "ranking": [  // опционально, если сценариев > 1
 *     { "rank": 1, "name": "...", "coverage": "~90%", "gaps": "..." },
 *     ...
 *   ],
 *   "catalog_snapshot": {
 *     "core": ["Foundation Models", "ML Inference", ...],
 *     "agents_count": 21,
 *     "mcp_count": 50,
 *     "fresh_announcements": []  // новинки с web_search, опционально
 *   },
 *   "scenarios": [
 *     {
 *       "name": "Сценарий 1. ...",
 *       "intro": "...",
 *       "steps": [
 *         "1. **Ingest** — ...",
 *         ...
 *       ],
 *       "mapping": [
 *         ["1", "Ingest", "AI Workflows + ...", "✅ Полное"],
 *         ...
 *       ],
 *       "gaps": ["**Gap 1**: ...", ...],
 *       "coverage_calc": {
 *         "n_full": 9, "n_partial": 0, "n_none": 1,
 *         "raw_pct": 90, "modifiers": ["—"],
 *         "final_pct": "~90%"
 *       },
 *       "mermaid": "flowchart LR\n  A[...]..."  // опционально
 *     },
 *     ...
 *   ],
 *   "conclusions": {
 *     "pattern": "...",
 *     "priority_gaps": ["...", "..."],
 *     "recommendations": ["...", "..."]
 *   }
 * }
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

// ---------- Константы стилей ----------
const FONT = "Arial";
const CLR_PRIMARY = "1F4E79";   // Cloud.ru-style тёмно-синий
const CLR_ACCENT  = "2E75B6";
const CLR_GOOD_BG = "E2EFDA";   // зелёный
const CLR_WARN_BG = "FFF2CC";   // жёлтый
const CLR_BAD_BG  = "FBE5D6";   // оранжевый
const CLR_ALT_BG  = "F2F2F2";   // zebra

const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

// ---------- Утилиты ----------
function parseInline(text) {
  if (typeof text !== 'string') text = String(text);
  const runs = [];
  const regex = /(\*\*[^*]+\*\*)|(`[^`]+`)|([^*`]+)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) runs.push(new TextRun({ text: m[1].slice(2, -2), bold: true, font: FONT }));
    else if (m[2]) runs.push(new TextRun({ text: m[2].slice(1, -1), font: "Consolas", size: 20 }));
    else runs.push(new TextRun({ text: m[3], font: FONT }));
  }
  return runs.length ? runs : [new TextRun({ text, font: FONT })];
}

const P = (text, opts = {}) => new Paragraph({
  children: parseInline(text),
  spacing: { after: 100, ...(opts.spacing || {}) },
  alignment: opts.align
});

const H = (text, level) => new Paragraph({
  heading: level,
  children: [new TextRun({ text, font: FONT })],
  spacing: { before: 300, after: 150 }
});

const Bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  children: parseInline(text),
  spacing: { after: 60 }
});

// ---------- Цветовой фон по статусу покрытия ----------
function bgForCoverage(text) {
  if (!text) return null;
  const s = String(text);
  if (s.includes("Полное") || s.includes("✅")) return CLR_GOOD_BG;
  if (s.includes("Частичное") || s.includes("⚠️")) return CLR_WARN_BG;
  if (s.includes("Нет") || s.includes("❌") || s.includes("GAP")) return CLR_BAD_BG;
  return null;
}

function bgForPct(text) {
  if (!text) return null;
  const pct = parseInt(String(text).replace(/[^\d]/g, ""));
  if (isNaN(pct)) return null;
  if (pct >= 85) return CLR_GOOD_BG;
  if (pct >= 70) return CLR_WARN_BG;
  return CLR_BAD_BG;
}

// ---------- Ячейка таблицы ----------
function cell(text, opts = {}) {
  const shading = opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined;
  const align = opts.align || AlignmentType.LEFT;
  const runs = opts.isHeader
    ? [new TextRun({ text: String(text), bold: true, font: FONT, color: "FFFFFF" })]
    : parseInline(String(text));
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children: runs })]
  });
}

// ---------- Построение таблицы из 2D-массива ----------
function buildTable(rows, columnWidths, opts = {}) {
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    rows: rows.map((row, i) => new TableRow({
      children: row.map((text, j) => {
        const isHeader = i === 0;
        let bg;
        if (isHeader) bg = CLR_PRIMARY;
        else if (opts.coverageCol !== undefined && j === opts.coverageCol) {
          bg = bgForCoverage(text) || (i % 2 === 0 ? CLR_ALT_BG : "FFFFFF");
        } else if (opts.pctCol !== undefined && j === opts.pctCol) {
          bg = bgForPct(text) || (i % 2 === 0 ? CLR_ALT_BG : "FFFFFF");
        } else {
          bg = i % 2 === 0 ? CLR_ALT_BG : "FFFFFF";
        }
        const isCenter = opts.centerCols && opts.centerCols.includes(j);
        return cell(text, {
          width: columnWidths[j],
          bg,
          isHeader,
          align: isCenter ? AlignmentType.CENTER : AlignmentType.LEFT
        });
      })
    }))
  });
}

// ---------- Блок для одного сценария ----------
function scenarioBlock(scenario, children) {
  children.push(H(scenario.name, HeadingLevel.HEADING_1));
  if (scenario.intro) {
    children.push(P(scenario.intro, { spacing: { after: 200 } }));
  }

  // Декомпозиция
  children.push(H("Декомпозиция workflow", HeadingLevel.HEADING_2));
  scenario.steps.forEach(s => children.push(Bullet(s)));

  // Маппинг
  children.push(H("Маппинг на сервисы AI Factory", HeadingLevel.HEADING_2));
  const mapHeader = ["#", "Шаг", "Сервис AI Factory", "Покрытие"];
  const mapCols = [800, 3000, 4060, 1500];
  children.push(buildTable(
    [mapHeader, ...scenario.mapping],
    mapCols,
    { coverageCol: 3, centerCols: [0, 3] }
  ));

  // Mermaid-диаграмма (если есть) — вставляем как code block
  if (scenario.mermaid) {
    children.push(H("Mermaid-диаграмма пайплайна", HeadingLevel.HEADING_2));
    children.push(P("Для рендеринга используй MCP Mermaid Server (из каталога Cloud.ru) или внешний Mermaid Live Editor.",
      { spacing: { after: 120 } }));
    // Вставляем mermaid-код как блок
    const lines = scenario.mermaid.split('\n');
    lines.forEach(line => {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, font: "Consolas", size: 18 })],
        spacing: { after: 0 },
        shading: { fill: "F5F5F5", type: ShadingType.CLEAR }
      }));
    });
  }

  // Gaps
  children.push(H("Что нельзя сделать «из коробки»", HeadingLevel.HEADING_2));
  if (scenario.gaps && scenario.gaps.length) {
    scenario.gaps.forEach(g => children.push(Bullet(g)));
  } else {
    children.push(P("Нет критичных gap'ов — сценарий полностью покрывается платформой."));
  }

  // Расчёт покрытия
  children.push(H("Расчёт покрытия", HeadingLevel.HEADING_2));
  const calc = scenario.coverage_calc;
  if (calc) {
    const calcRows = [
      ["Категория", "Count", "Вес", "Вклад"],
      ["✅ Полное", String(calc.n_full), "1.0", String(calc.n_full)],
      ["⚠️ Частичное", String(calc.n_partial), "0.5", String(calc.n_partial * 0.5)],
      ["❌ Нет", String(calc.n_none), "0.0", "0"]
    ];
    children.push(buildTable(calcRows, [2400, 1600, 1200, 1200], { centerCols: [1, 2, 3] }));

    const total = calc.n_full + calc.n_partial + calc.n_none;
    children.push(P(`Общее число шагов: ${total}`, { spacing: { before: 120 } }));
    children.push(P(`coverage_raw = (${calc.n_full} + ${calc.n_partial * 0.5}) / ${total} = ${((calc.n_full + calc.n_partial * 0.5) / total).toFixed(3)}`));
    children.push(P(`coverage_pct = ${calc.raw_pct}%`));
    if (calc.modifiers && calc.modifiers.length && calc.modifiers[0] !== "—") {
      children.push(P(`Применены модификаторы: ${calc.modifiers.join(", ")}`));
    }
  }
  children.push(new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [
      new TextRun({ text: "Итоговое покрытие: ", font: FONT, bold: true }),
      new TextRun({
        text: scenario.coverage_calc?.final_pct || "—",
        font: FONT, bold: true, color: CLR_PRIMARY, size: 28
      })
    ]
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
}

// ---------- Главная функция ----------
function buildReport(data) {
  const children = [];

  // Титул
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 200 },
    children: [new TextRun({
      text: data.title || "Анализ покрытия сценариев сервисами AI Factory",
      bold: true, font: FONT, size: 40, color: CLR_PRIMARY
    })]
  }));
  if (data.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({
        text: data.subtitle, italics: true, font: FONT, size: 28, color: "595959"
      })]
    }));
  }
  children.push(P(`Дата: ${data.date || "—"}`,
    { align: AlignmentType.CENTER }));
  children.push(P(`Версия каталога: ${data.catalog_version || "—"}`,
    { align: AlignmentType.CENTER }));
  children.push(P("Методология: First Principles + AI Factory Coverage Framework",
    { align: AlignmentType.CENTER }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Executive Summary
  children.push(H("Executive Summary", HeadingLevel.HEADING_1));
  if (data.executive_summary) {
    if (data.executive_summary.tldr) {
      children.push(P(`**TL;DR:** ${data.executive_summary.tldr}`));
    }
    if (data.executive_summary.key_findings && data.executive_summary.key_findings.length) {
      children.push(H("Ключевые выводы", HeadingLevel.HEADING_2));
      data.executive_summary.key_findings.forEach(f => children.push(Bullet(f)));
    }
  }

  // Ранжирование (если есть)
  if (data.ranking && data.ranking.length > 0) {
    children.push(H("Сводное ранжирование", HeadingLevel.HEADING_2));
    const rankHeader = ["Ранг", "Сценарий", "Покрытие", "Главные gaps"];
    const rankRows = data.ranking.map(r => [
      String(r.rank), r.name, r.coverage, r.gaps
    ]);
    children.push(buildTable(
      [rankHeader, ...rankRows],
      [900, 3800, 1400, 3260],
      { pctCol: 2, centerCols: [0, 2] }
    ));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Справочник
  if (data.catalog_snapshot) {
    children.push(H("Справочник AI Factory (на момент анализа)", HeadingLevel.HEADING_1));
    const c = data.catalog_snapshot;
    if (c.core && c.core.length) {
      children.push(H("Платформенные сервисы (core)", HeadingLevel.HEADING_2));
      c.core.forEach(s => children.push(Bullet(s)));
    }
    if (c.agents_count !== undefined) {
      children.push(P(`**Готовых AI-агентов в каталоге:** ${c.agents_count}`));
    }
    if (c.mcp_count !== undefined) {
      children.push(P(`**MCP-серверов в каталоге:** ${c.mcp_count}`));
    }
    if (c.fresh_announcements && c.fresh_announcements.length) {
      children.push(H("Свежие анонсы (с web_search)", HeadingLevel.HEADING_2));
      c.fresh_announcements.forEach(a => children.push(Bullet(a)));
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Сценарии
  if (data.scenarios && data.scenarios.length) {
    data.scenarios.forEach(s => scenarioBlock(s, children));
  }

  // Выводы
  if (data.conclusions) {
    children.push(H("Выводы и рекомендации", HeadingLevel.HEADING_1));
    if (data.conclusions.pattern) {
      children.push(H("Общий паттерн", HeadingLevel.HEADING_2));
      children.push(P(data.conclusions.pattern));
    }
    if (data.conclusions.priority_gaps && data.conclusions.priority_gaps.length) {
      children.push(H("Приоритетные gaps для развития платформы", HeadingLevel.HEADING_2));
      data.conclusions.priority_gaps.forEach(g => children.push(Bullet(g)));
    }
    if (data.conclusions.recommendations && data.conclusions.recommendations.length) {
      children.push(H("Рекомендации по реализации", HeadingLevel.HEADING_2));
      data.conclusions.recommendations.forEach(r => children.push(Bullet(r)));
    }
  }

  // Сборка документа
  return new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: FONT, color: CLR_PRIMARY },
          paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 }
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: FONT, color: CLR_ACCENT },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 }
        }
      ]
    },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } }
        }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
        }
      },
      children
    }]
  });
}

// ---------- CLI ----------
function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node build_docx_report.js <input.json> <output.docx>");
    process.exit(1);
  }
  const [inputPath, outputPath] = args;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read/parse ${inputPath}:`, e.message);
    process.exit(1);
  }

  const doc = buildReport(data);

  Packer.toBuffer(doc).then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log(`✅ DOCX создан: ${outputPath}`);
    console.log(`Размер: ${(buf.length / 1024).toFixed(1)} KB`);
  }).catch(e => {
    console.error("❌ Ошибка сборки:", e);
    process.exit(1);
  });
}

if (require.main === module) main();

module.exports = { buildReport };
