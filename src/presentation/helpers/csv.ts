import type { Request, Response } from 'express';

/**
 * Serialización CSV + content-negotiation para endpoints que devuelven JSON
 * por default y CSV cuando `?format=csv` está presente.
 *
 * Decisiones:
 *   - Separator: coma (',').
 *   - Line ending: CRLF (Excel-friendly).
 *   - Encoding: UTF-8 con BOM (así Excel reconoce tildes/ñ correctamente).
 *   - Escaping: RFC 4180 — comillas dobles rodean valores con `",\r\n`, y
 *     las comillas internas se duplican ("a → "a"").
 *   - Null/undefined → string vacío.
 *   - Dates: helpers `formatDateOnly`/`formatDateTime` extraen las partes
 *     en UTC (sin tz conversion). La DB guarda AR-local wall-clock sin tz
 *     metadata, así que los UTC parts del Date son AR-local — misma
 *     convención que usa el frontend.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCsvValue(c.header)).join(','));
  for (const row of rows) {
    const values = columns.map((c) => {
      const raw = c.value(row);
      if (raw === null || raw === undefined) return '';
      return escapeCsvValue(String(raw));
    });
    lines.push(values.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function escapeCsvValue(v: string): string {
  if (/[",\r\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

export function toCsvWithBom<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return '\uFEFF' + toCsv(rows, columns);
}

/**
 * Helper para el handler: si `req.query.format === 'csv'` responde CSV;
 * si no, responde JSON con `jsonPayload`. Mantiene en un solo lugar los
 * headers de Content-Type y Content-Disposition.
 */
export function respondMaybeCsv<T>(
  req: Request,
  res: Response,
  jsonPayload: unknown,
  csvSpec: { filename: string; rows: T[]; columns: CsvColumn<T>[] },
): void {
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvSpec.filename}"`,
    );
    res.send(toCsvWithBom(csvSpec.rows, csvSpec.columns));
    return;
  }
  res.json(jsonPayload);
}

/**
 * Formatea el calendar date de un Date|ISO string en formato `YYYY-MM-DD`
 * usando UTC parts. Para values con AR-local wall-clock-as-UTC (convención
 * del schema), esto devuelve la fecha local correcta.
 */
export function formatDateOnly(v: Date | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Formatea Date|ISO como `YYYY-MM-DD HH:MM:SS` usando UTC parts (misma
 * convención que `formatDateOnly`).
 */
export function formatDateTime(v: Date | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mi}:${ss}`;
}
