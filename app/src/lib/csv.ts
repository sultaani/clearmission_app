/** Escapes a single CSV field: wraps in quotes and doubles any internal
 *  quotes if the value contains a comma, quote, or newline. */
function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts an array of flat objects into a CSV string, using the keys of
 *  the first row as the header. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(',')),
  ];
  return lines.join('\r\n');
}

/** Triggers a real browser file download for the given CSV content — no
 *  server round trip, since the data driving a report page is already
 *  loaded client-side by the time someone wants to export it. */
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
