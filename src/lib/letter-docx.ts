import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from "docx";

const FONT = "Arial";
const SIZE = 21; // half-points: 10.5pt
const SIZE_SMALL = 19; // 9.5pt for table cells

// A4 content width with 1 inch margins: 11906 - 2880 = 9026 DXA
const CONTENT_WIDTH = 9026;

const SECTION_HEADINGS = new Set([
  // New full-letter format
  "PATIENT DETAILS",
  "REASON FOR REFERRAL",
  "MEDICAL HISTORY",
  "SURGICAL / ANAESTHETIC HISTORY",
  "CLINICAL ASSESSMENT",
  "INVESTIGATIONS REQUESTED / PENDING",
  "PERIOPERATIVE MEDICATION MANAGEMENT",
  "PLAN AND FOLLOW-UP",
  // Legacy format (backward compat)
  "PRESENTING HISTORY",
  "PAST MEDICAL & SURGICAL HISTORY",
  "CURRENT MEDICATIONS",
  "ALLERGIES / INTOLERANCES",
  "SOCIAL HISTORY",
  "RECENT INVESTIGATIONS",
  "SYSTEMS REVIEW",
  "ANAESTHETIC / SURGICAL RISK ASSESSMENT",
  "PRE-OPERATIVE PLAN",
  "FITNESS FOR SURGERY",
]);

function parseInlineRuns(line: string, sz = SIZE): TextRun[] {
  const runs: TextRun[] = [];
  const parts = line.split(/(\*\*[^*]+\*\*)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: FONT, size: sz }));
    } else {
      runs.push(new TextRun({ text: part, font: FONT, size: sz }));
    }
  }

  return runs.length ? runs : [new TextRun({ text: line, font: FONT, size: sz })];
}

function isTableLine(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|") && line.includes("|");
}

function isSeparatorLine(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, ""));
}

function parseTableBlock(lines: string[]): Table {
  const dataLines = lines.filter((l) => !isSeparatorLine(l));
  const colCount = dataLines[0]?.split("|").slice(1, -1).length || 1;
  const colWidth = Math.floor(CONTENT_WIDTH / colCount);

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

  const rows = dataLines.map((line, rowIndex) => {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const isHeader = rowIndex === 0;

    return new TableRow({
      tableHeader: isHeader,
      children: cells.map((cellText) =>
        new TableCell({
          borders,
          width: { size: colWidth, type: WidthType.DXA },
          shading: isHeader
            ? { fill: "F1F5F9", type: ShadingType.CLEAR }
            : { fill: "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: parseInlineRuns(cellText, SIZE_SMALL),
              ...(isHeader ? {} : {}),
            }),
          ],
        })
      ),
    });
  });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(colWidth),
    rows,
  });
}

type DocxChild = Paragraph | Table;

export function letterTextToChildren(letterText: string): DocxChild[] {
  const rawLines = letterText.split("\n");
  const children: DocxChild[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    // Collect table blocks
    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < rawLines.length && isTableLine(rawLines[i].trim())) {
        tableLines.push(rawLines[i].trim());
        i++;
      }
      children.push(new Paragraph({ text: "" })); // spacing before table
      children.push(parseTableBlock(tableLines));
      children.push(new Paragraph({ text: "" })); // spacing after table
      continue;
    }

    i++;

    if (!line) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    // Date line at top (e.g. "30 June 2026")
    if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(line)) {
      children.push(
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: line, font: FONT, size: SIZE })],
        })
      );
      continue;
    }

    // Greeting
    if (line.startsWith("Dear ")) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [new TextRun({ text: line, font: FONT, size: SIZE })],
        })
      );
      continue;
    }

    // Re: subject line
    if (line.startsWith("Re:") || line.startsWith("RE:")) {
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: line, bold: true, font: FONT, size: SIZE })],
        })
      );
      continue;
    }

    // CC line
    if (line.startsWith("CC:")) {
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: parseInlineRuns(line),
        })
      );
      continue;
    }

    // Section headings
    if (line === line.toUpperCase() && SECTION_HEADINGS.has(line)) {
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: line, bold: true, font: FONT, size: SIZE })],
        })
      );
      continue;
    }

    // Bullet level 0
    if (line.startsWith("• ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(line.slice(2)),
        })
      );
      continue;
    }

    // Bullet level 1
    if (line.startsWith("◦ ")) {
      children.push(
        new Paragraph({
          bullet: { level: 1 },
          children: parseInlineRuns(line.slice(2)),
        })
      );
      continue;
    }

    // Numbered list items
    if (/^\d+\.\s/.test(line)) {
      children.push(
        new Paragraph({
          spacing: { before: 160 },
          children: parseInlineRuns(line),
        })
      );
      continue;
    }

    // "Yours sincerely," and sign-off lines
    if (line === "Yours sincerely," || line === "Yours sincerely") {
      children.push(
        new Paragraph({
          spacing: { before: 400, after: 0 },
          children: [new TextRun({ text: line, font: FONT, size: SIZE })],
        })
      );
      continue;
    }

    // Default paragraph
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: parseInlineRuns(line),
      })
    );
  }

  return children;
}

export async function letterTextToDocxBuffer(letterText: string): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: letterTextToChildren(letterText),
      },
    ],
  });

  return Packer.toBuffer(doc);
}
