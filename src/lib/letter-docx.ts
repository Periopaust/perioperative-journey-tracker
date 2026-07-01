import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, ImageRun, AlignmentType,
} from "docx";
import fs from "fs";
import path from "path";

const FONT = "Arial";
const SIZE = 21;       // 10.5pt
const SIZE_SMALL = 19; // 9.5pt
const SIZE_TINY = 17;  // 8.5pt

// A4 with 1" margins: 11906 - 2880 = 9026 DXA
const CONTENT_WIDTH = 9026;

const DISCLAIMER =
  "This letter contains sensitive information and remains a confidential report meant only for the person/s named. " +
  "If you are not the direct party do not copy, distribute or discuss this email. " +
  "Contact sender immediately if this was sent by mistake and delete from your system. " +
  "Contact BGB at info@drsahilvohra.com.au if required.";

const BGB_ADDRESS_LINES = [
  "BGB HealthCare Clinic — Better Growing Bodies",
  "Dr Sahil Vohra  |  Internal Medicine Specialist",
  "Phone: 0485 052 288  |  Email: info@drsahilvohra.com.au",
  "Website: www.drsahilvohra.com.au",
];

const SECTION_HEADINGS = new Set([
  "PATIENT DETAILS", "REASON FOR REFERRAL", "MEDICAL HISTORY",
  "SURGICAL / ANAESTHETIC HISTORY", "CLINICAL ASSESSMENT",
  "INVESTIGATIONS REQUESTED / PENDING", "PERIOPERATIVE MEDICATION MANAGEMENT",
  "PLAN AND FOLLOW-UP", "PRESENTING HISTORY", "PAST MEDICAL & SURGICAL HISTORY",
  "CURRENT MEDICATIONS", "ALLERGIES / INTOLERANCES", "SOCIAL HISTORY",
  "RECENT INVESTIGATIONS", "SYSTEMS REVIEW", "ANAESTHETIC / SURGICAL RISK ASSESSMENT",
  "PRE-OPERATIVE PLAN", "FITNESS FOR SURGERY", "HISTORY", "IMPRESSION",
  "INVESTIGATIONS REQUESTED", "MANAGEMENT PLAN",
]);

// ── Image helpers ────────────────────────────────────────────────────────────

function readLogo(filename: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "logos", filename));
  } catch {
    return null;
  }
}

function logoRun(data: Buffer, ext: "png" | "jpg", widthPx: number, heightPx: number): ImageRun {
  return new ImageRun({
    data,
    transformation: { width: widthPx, height: heightPx },
    type: ext,
  });
}

// ── Letterhead ───────────────────────────────────────────────────────────────

function noBorder() {
  return { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
}

function buildLetterhead(isPeriopLetter: boolean): Table {
  const paBuf  = readLogo("periop-australia.png");
  const bgbBuf = readLogo("bgb.png");

  // Left cell
  const leftChildren: (Paragraph)[] = [];
  if (isPeriopLetter) {
    // PA logo, large, left-aligned
    if (paBuf) {
      leftChildren.push(new Paragraph({
        children: [logoRun(paBuf, "png", 160, 60)],
        alignment: AlignmentType.LEFT,
      }));
    } else {
      leftChildren.push(new Paragraph({ children: [new TextRun({ text: "Perioperative Australia", bold: true, font: FONT, size: SIZE })] }));
    }
  } else {
    // BGB logo + address lines
    if (bgbBuf) {
      leftChildren.push(new Paragraph({
        children: [logoRun(bgbBuf, "png", 70, 70)],
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
      }));
    }
    for (const line of BGB_ADDRESS_LINES) {
      leftChildren.push(new Paragraph({
        children: [new TextRun({ text: line, font: FONT, size: SIZE_TINY, color: "444444" })],
        spacing: { after: 20 },
      }));
    }
  }

  // Right cell
  const rightChildren: (Paragraph)[] = [];
  if (isPeriopLetter) {
    // BGB logo + address, smaller, right-aligned
    if (bgbBuf) {
      rightChildren.push(new Paragraph({
        children: [logoRun(bgbBuf, "png", 55, 55)],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 40 },
      }));
    }
    for (const line of BGB_ADDRESS_LINES) {
      rightChildren.push(new Paragraph({
        children: [new TextRun({ text: line, font: FONT, size: SIZE_TINY, color: "444444" })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 20 },
      }));
    }
  } else {
    // PA logo, right-aligned
    if (paBuf) {
      rightChildren.push(new Paragraph({
        children: [logoRun(paBuf, "png", 130, 50)],
        alignment: AlignmentType.RIGHT,
      }));
    } else {
      rightChildren.push(new Paragraph({
        children: [new TextRun({ text: "Perioperative Australia", bold: true, font: FONT, size: SIZE })],
        alignment: AlignmentType.RIGHT,
      }));
    }
  }

  const borders = { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() };
  const half = Math.floor(CONTENT_WIDTH / 2);

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, half],
    borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: half, type: WidthType.DXA },
            children: leftChildren,
          }),
          new TableCell({
            borders,
            width: { size: half, type: WidthType.DXA },
            children: rightChildren,
          }),
        ],
      }),
    ],
  });
}

// ── Sign-off block ───────────────────────────────────────────────────────────

function buildSignoff(): (Paragraph)[] {
  const sigBuf = readLogo("signature.jpg");
  const paras: Paragraph[] = [];

  paras.push(new Paragraph({
    spacing: { before: 400, after: 0 },
    children: [new TextRun({ text: "Kind Regards,", font: FONT, size: SIZE })],
  }));

  if (sigBuf) {
    paras.push(new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [logoRun(sigBuf, "jpg", 120, 60)],
    }));
  } else {
    paras.push(new Paragraph({ text: "", spacing: { before: 480, after: 0 } }));
  }

  const credentials = [
    { text: "Dr Sahil Vohra", bold: true },
    { text: "Internal Medicine Specialist", bold: true },
    { text: "MBBS, M.D. FRACP.", bold: false },
    { text: "Provider number: 661487NH", bold: false },
    { text: "We use Medical Objects for communication.", bold: false },
  ];

  for (const c of credentials) {
    paras.push(new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: c.text, bold: c.bold, font: FONT, size: SIZE_SMALL })],
    }));
  }

  return paras;
}

// ── Disclaimer ───────────────────────────────────────────────────────────────

function buildDisclaimer(): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
      children: [new TextRun({ text: DISCLAIMER, italics: true, font: FONT, size: SIZE_TINY, color: "666666" })],
    }),
  ];
}

// ── Inline run parser ────────────────────────────────────────────────────────

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

// ── Table parser ─────────────────────────────────────────────────────────────

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
          shading: isHeader ? { fill: "F1F5F9", type: ShadingType.CLEAR } : { fill: "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: parseInlineRuns(cellText, SIZE_SMALL) })],
        })
      ),
    });
  });

  return new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: Array(colCount).fill(colWidth), rows });
}

// ── Letter body parser ───────────────────────────────────────────────────────

type DocxChild = Paragraph | Table;

export function letterTextToChildren(letterText: string): DocxChild[] {
  // Strip AI-generated sign-off — we add our own
  const signoffIdx = letterText.search(/^yours sincerely[,.]?\s*$/im);
  const bodyText = signoffIdx !== -1 ? letterText.substring(0, signoffIdx).trimEnd() : letterText;

  const rawLines = bodyText.split("\n");
  const children: DocxChild[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < rawLines.length && isTableLine(rawLines[i].trim())) {
        tableLines.push(rawLines[i].trim());
        i++;
      }
      children.push(new Paragraph({ text: "" }));
      children.push(parseTableBlock(tableLines));
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    i++;

    if (!line) { children.push(new Paragraph({ text: "" })); continue; }

    if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(line)) {
      children.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: line, font: FONT, size: SIZE })] }));
      continue;
    }

    if (line.startsWith("Dear ")) {
      children.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: line, font: FONT, size: SIZE })] }));
      continue;
    }

    if (line.startsWith("Re:") || line.startsWith("RE:")) {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: line, bold: true, font: FONT, size: SIZE })] }));
      continue;
    }

    if (line.startsWith("CC:") || line.startsWith("cc:")) {
      children.push(new Paragraph({ spacing: { before: 200 }, children: parseInlineRuns(line) }));
      continue;
    }

    if (line === line.toUpperCase() && SECTION_HEADINGS.has(line)) {
      children.push(new Paragraph({ spacing: { before: 280, after: 120 }, children: [new TextRun({ text: line, bold: true, font: FONT, size: SIZE })] }));
      continue;
    }

    if (line.startsWith("• ")) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: parseInlineRuns(line.slice(2)) }));
      continue;
    }

    if (line.startsWith("◦ ")) {
      children.push(new Paragraph({ bullet: { level: 1 }, children: parseInlineRuns(line.slice(2)) }));
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({ spacing: { before: 160 }, children: parseInlineRuns(line) }));
      continue;
    }

    children.push(new Paragraph({ spacing: { after: 100 }, children: parseInlineRuns(line) }));
  }

  return children;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function letterTextToDocxBuffer(
  letterText: string,
  isPeriopLetter = false
): Promise<Buffer> {
  const letterhead = buildLetterhead(isPeriopLetter);
  const divider = new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "0B4F45" } },
    spacing: { before: 120, after: 240 },
    text: "",
  });
  const body = letterTextToChildren(letterText);
  const signoff = buildSignoff();
  const disclaimer = buildDisclaimer();

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: SIZE } } },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } },
      },
      children: [letterhead, divider, ...body, ...signoff, ...disclaimer],
    }],
  });

  return Packer.toBuffer(doc);
}
