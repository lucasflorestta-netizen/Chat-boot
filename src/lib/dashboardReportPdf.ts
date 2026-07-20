/** Minimal PDF writer (WinAnsi) for Dashboard attendance report. */

export type DashboardReportFilters = {
  from: string | null;
  to: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  rating: number | null;
};

export type DashboardReportInput = {
  generatedAt: Date;
  filters?: DashboardReportFilters;
  activeCount: number;
  finishedCount: number;
  openCount: number;
  awaiting: number;
  closedInPeriod: number;
  totalTickets: number;
  avgResponseTime: string;
  byStatus: { status: string; count: number }[];
  nps: {
    total: number;
    average: number | null;
    distribution: Record<number, number>;
  };
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 45;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const STATUS_LABEL: Record<string, string> = {
  EM_TRIAGEM: 'Em triagem',
  AGUARDANDO: 'Aguardando (fila)',
  EM_ATENDIMENTO: 'Em atendimento',
  FECHADO: 'Finalizados',
};

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toWinAnsi(text: string): string {
  const map: Record<string, string> = {
    Á: '\xc1',
    À: '\xc0',
    Â: '\xc2',
    Ã: '\xc3',
    Ä: '\xc4',
    É: '\xc9',
    È: '\xc8',
    Ê: '\xca',
    Ë: '\xcb',
    Í: '\xcd',
    Ì: '\xcc',
    Î: '\xce',
    Ï: '\xcf',
    Ó: '\xd3',
    Ò: '\xd2',
    Ô: '\xd4',
    Õ: '\xd5',
    Ö: '\xd6',
    Ú: '\xda',
    Ù: '\xd9',
    Û: '\xdb',
    Ü: '\xdc',
    Ç: '\xc7',
    á: '\xe1',
    à: '\xe0',
    â: '\xe2',
    ã: '\xe3',
    ä: '\xe4',
    é: '\xe9',
    è: '\xe8',
    ê: '\xea',
    ë: '\xeb',
    í: '\xed',
    ì: '\xec',
    î: '\xee',
    ï: '\xef',
    ó: '\xf3',
    ò: '\xf2',
    ô: '\xf4',
    õ: '\xf5',
    ö: '\xf6',
    ú: '\xfa',
    ù: '\xf9',
    û: '\xfb',
    ü: '\xfc',
    ç: '\xe7',
    ñ: '\xf1',
    Ñ: '\xd1',
    '\u2014': '-', // —
    '\u2013': '-', // –
    '\u2026': '...', // …
    '\u2192': '->', // →
    '\u201C': '"', // “
    '\u201D': '"', // ”
    '\u2018': "'", // ‘
    '\u2019': "'", // ’
  };
  let out = '';
  for (const ch of text) {
    out += map[ch] ?? (ch.charCodeAt(0) <= 255 ? ch : '?');
  }
  return out;
}

type Line = { text: string; size: number; bold?: boolean; gapAfter?: number };

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [''];
  const avgChar = fontSize * 0.52;
  const maxChars = Math.max(24, Math.floor(maxWidth / avgChar));
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function filterLines(filters?: DashboardReportFilters): Line[] {
  if (!filters) return [];
  const lines: Line[] = [
    { text: 'Filtros aplicados', size: 13, bold: true, gapAfter: 10 },
  ];

  if (filters.from || filters.to) {
    const a = filters.from ? formatDay(filters.from) : 'início';
    const b = filters.to ? formatDay(filters.to) : 'hoje';
    lines.push({ text: `Período: ${a} a ${b}`, size: 10, gapAfter: 6 });
  } else {
    lines.push({ text: 'Período: todos os dias', size: 10, gapAfter: 6 });
  }

  if (filters.assigneeName || filters.assigneeId) {
    lines.push({
      text: `Usuário: ${filters.assigneeName ?? filters.assigneeId}`,
      size: 10,
      gapAfter: 6,
    });
  } else {
    lines.push({ text: 'Usuário: todos', size: 10, gapAfter: 6 });
  }

  if (filters.rating != null) {
    lines.push({
      text: `Avaliação NPS: ${filters.rating} estrela(s)`,
      size: 10,
      gapAfter: 16,
    });
  } else {
    lines.push({ text: 'Avaliação NPS: todas', size: 10, gapAfter: 16 });
  }

  return lines;
}

function buildLines(data: DashboardReportInput): Line[] {
  const when = data.generatedAt.toLocaleString('pt-BR');
  const lines: Line[] = [
    { text: 'Relatório de Atendimentos', size: 20, bold: true, gapAfter: 10 },
    { text: 'Dashboard — visão operacional', size: 11, gapAfter: 6 },
    { text: `Gerado em: ${when}`, size: 9, gapAfter: 18 },
    ...filterLines(data.filters),
    { text: '1. Indicadores', size: 13, bold: true, gapAfter: 10 },
    { text: `Conversas ativas (EM_ATENDIMENTO): ${data.activeCount}`, size: 10, gapAfter: 6 },
    { text: `Tickets em aberto (triagem + fila): ${data.openCount}`, size: 10, gapAfter: 6 },
    { text: `Na fila (AGUARDANDO): ${data.awaiting}`, size: 10, gapAfter: 6 },
    { text: `Tickets finalizados (FECHADO): ${data.finishedCount}`, size: 10, gapAfter: 6 },
    {
      text: `Finalizados no período (finishedAt): ${data.closedInPeriod}`,
      size: 10,
      gapAfter: 6,
    },
    { text: `Total de tickets (filtro): ${data.totalTickets}`, size: 10, gapAfter: 6 },
    { text: `Tempo médio de resposta: ${data.avgResponseTime}`, size: 10, gapAfter: 18 },
    { text: '2. Por status', size: 13, bold: true, gapAfter: 10 },
  ];

  if (data.byStatus.length === 0) {
    lines.push({ text: 'Sem dados de status para os filtros.', size: 10, gapAfter: 14 });
  } else {
    for (const row of data.byStatus) {
      const label = STATUS_LABEL[row.status] ?? row.status;
      lines.push({ text: `${label}: ${row.count}`, size: 10, gapAfter: 6 });
    }
    lines.push({ text: '', size: 10, gapAfter: 8 });
  }

  lines.push({ text: '3. Fluxo de atendimentos (resumo)', size: 13, bold: true, gapAfter: 10 });
  lines.push({
    text: 'Triagem / Fila -> Assumir -> Em Atendimento -> Finalizar -> FECHADO',
    size: 9,
    gapAfter: 6,
  });
  lines.push({
    text: 'Só o assignee responde. Transferência agent->agent exige aceite.',
    size: 9,
    gapAfter: 18,
  });

  lines.push({ text: '4. NPS (avaliação)', size: 13, bold: true, gapAfter: 10 });
  if (data.nps.total === 0) {
    lines.push({
      text: 'Nenhuma avaliação no recorte filtrado.',
      size: 10,
      gapAfter: 8,
    });
  } else {
    const avg =
      data.nps.average != null ? Number(data.nps.average).toFixed(2) : '-';
    lines.push({ text: `Média: ${avg}  |  Total: ${data.nps.total}`, size: 10, gapAfter: 6 });
    for (const star of [5, 4, 3, 2, 1]) {
      const c = data.nps.distribution[star] ?? 0;
      lines.push({ text: `${star} estrela(s): ${c}`, size: 10, gapAfter: 5 });
    }
  }

  return lines;
}

class PdfLayout {
  private ops: string[] = [];
  private y = PAGE_H - MARGIN_TOP;
  private pageIndex = 0;
  private pageStarts: number[] = [0];

  constructor(private readonly lines: Line[]) {}

  render(): string[] {
    for (const line of this.lines) {
      this.drawLine(line);
    }
    this.drawFooter();
    return this.pageStarts.map((start, i) => {
      const end = i + 1 < this.pageStarts.length ? this.pageStarts[i + 1] : this.ops.length;
      return this.ops.slice(start, end).join('\n');
    });
  }

  private newPage() {
    this.pageIndex += 1;
    this.y = PAGE_H - MARGIN_TOP;
    this.pageStarts.push(this.ops.length);
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < MARGIN_BOTTOM) {
      this.newPage();
    }
  }

  private drawText(text: string, size: number, bold: boolean) {
    const font = bold ? 'F2' : 'F1';
    const safe = escapePdf(toWinAnsi(text));
    this.ops.push('BT');
    this.ops.push(`/${font} ${size} Tf`);
    this.ops.push(`1 0 0 1 ${MARGIN_X} ${this.y} Tm`);
    this.ops.push(`(${safe}) Tj`);
    this.ops.push('ET');
    this.y -= size * 1.25;
  }

  private drawLine(line: Line) {
    if (!line.text.trim()) {
      this.y -= line.gapAfter ?? 8;
      return;
    }

    const wrapped = wrapText(line.text, line.size, CONTENT_W);
    const lineHeight = line.size * 1.25;
    const gapAfter = line.gapAfter ?? 8;
    const blockHeight = wrapped.length * lineHeight + gapAfter;

    this.ensureSpace(blockHeight);

    for (const part of wrapped) {
      this.drawText(part, line.size, !!line.bold);
    }
    this.y -= gapAfter;
  }

  private drawFooter() {
    this.ensureSpace(20);
    this.drawText('NGE Helpdesk — Relatório do Dashboard', 8, false);
  }
}

function buildPdfBytes(lines: Line[]): Uint8Array {
  const pageStreams = new PdfLayout(lines).render();
  const pageCount = pageStreams.length;
  const fontRegularId = 3 + pageCount * 2;
  const fontBoldId = fontRegularId + 1;

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageKids = pageStreams.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pageCount} >>\nendobj\n`);

  for (let i = 0; i < pageCount; i++) {
    const contentId = 3 + i * 2;
    const pageId = 4 + i * 2;
    const stream = pageStreams[i];
    objects.push(
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>\nendobj\n`,
    );
  }

  objects.push(
    `${fontRegularId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );
  objects.push(
    `${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function downloadDashboardReportPdf(data: DashboardReportInput, filename?: string) {
  const bytes = buildPdfBytes(buildLines(data));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `relatorio-atendimentos-${data.generatedAt.toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
