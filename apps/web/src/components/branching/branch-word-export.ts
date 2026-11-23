import type { IRunOptions, ParagraphChild } from "docx";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

function textRuns(element: Node, style: IRunOptions = {}): ParagraphChild[] {
  if (element.nodeType === Node.TEXT_NODE)
    return [new TextRun({ ...style, text: element.textContent ?? "" })];
  if (!(element instanceof HTMLElement)) return [];
  const tag = element.tagName;
  if (tag === "BR") return [new TextRun({ break: 1 })];
  const children = Array.from(element.childNodes).flatMap((child) =>
    textRuns(child, {
      ...style,
      ...(tag === "B" || tag === "STRONG" ? { bold: true } : {}),
      ...(tag === "I" || tag === "EM" ? { italics: true } : {}),
      ...(tag === "S" || tag === "DEL" ? { strike: true } : {}),
      ...(tag === "CODE" ? { font: "Consolas" } : {}),
      ...(tag === "A" ? { style: "Hyperlink" } : {}),
    }),
  );
  const link = element.getAttribute("href");
  return tag === "A" && link && /^(https?:|mailto:)/i.test(link)
    ? [new ExternalHyperlink({ link, children })]
    : children;
}

export async function wordDocumentBytes(html: string, title: string) {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  let listInstance = 0;
  const headings = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];

  function blocks(root: HTMLElement, depth = 0): Array<Paragraph | Table> {
    return Array.from(root.children).flatMap((node) =>
      node instanceof HTMLElement ? exportElement(node, depth) : [],
    );
  }

  function exportElement(node: HTMLElement, depth: number): Array<Paragraph | Table> {
    const tag = node.tagName;
    if (tag === "TABLE" && node instanceof HTMLTableElement) {
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: Array.from(node.rows).map(
            (row) =>
              new TableRow({
                children: Array.from(row.cells).map(
                  (cell) =>
                    new TableCell({ children: [new Paragraph({ children: textRuns(cell) })] }),
                ),
              }),
          ),
        }),
      ];
    }
    if (tag === "UL" || tag === "OL") {
      const instance = ++listInstance;
      return Array.from(node.children).flatMap((item) => {
        const children = Array.from(item.childNodes)
          .filter((child) => !(child instanceof HTMLElement && /^(UL|OL)$/.test(child.tagName)))
          .flatMap((child) => textRuns(child));
        const list = new Paragraph({
          children,
          ...(tag === "OL"
            ? { numbering: { reference: "ordered", level: 0, instance } }
            : { bullet: { level: Math.min(depth, 8) } }),
        });
        const nestedItems = Array.from(item.children).flatMap((child) =>
          child instanceof HTMLElement && /^(UL|OL)$/.test(child.tagName)
            ? exportElement(child, depth + 1)
            : [],
        );
        return [list, ...nestedItems];
      });
    }
    if (tag === "DIV" || tag === "SECTION") return blocks(node, depth);
    const level = /^H[1-6]$/.test(tag) ? headings[Number(tag[1]) - 1] : undefined;
    return [new Paragraph({ heading: level, children: textRuns(node) })];
  }
  const document = new Document({
    title,
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ children: blocks(body) }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
