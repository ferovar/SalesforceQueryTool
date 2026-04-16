/**
 * Pure helpers for CSV export. Extracted from salesforce.ts so the
 * serialization logic can be unit-tested without spinning up Electron
 * or a jsforce connection.
 */

export type CsvRecord = Record<string, unknown>;

/**
 * Recursively flattens a Salesforce-style record into dot-notation keys.
 * Skips the Salesforce `attributes` metadata block. Arrays are kept as-is
 * (serialized to JSON by the caller).
 */
export function flattenRecord(
  record: CsvRecord,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key === 'attributes') continue;
    const value = (record as Record<string, unknown>)[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      Object.assign(result, flattenRecord(value as CsvRecord, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Serializes an array of records to a CSV string. Collects the union of
 * keys across all flattened records, quotes every cell, and escapes embedded
 * quotes per RFC 4180. Null/undefined values render as empty cells. Nested
 * arrays/objects (non-plain) are JSON-encoded.
 */
export function recordsToCsv(data: CsvRecord[]): string {
  if (data.length === 0) {
    throw new Error('No data to export');
  }
  const flattened = data.map((r) => flattenRecord(r));
  const headers = new Set<string>();
  for (const row of flattened) {
    for (const k of Object.keys(row)) headers.add(k);
  }
  const headerArray = Array.from(headers);
  const rows: string[] = [];
  rows.push(headerArray.map((h) => `"${h}"`).join(','));
  for (const row of flattened) {
    const cells = headerArray.map((header) => {
      let value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') value = JSON.stringify(value);
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    rows.push(cells.join(','));
  }
  return rows.join('\n');
}

/**
 * Hardens a renderer-supplied filename against path traversal and
 * control characters before it is passed to the OS save dialog as a
 * default path suggestion. The dialog itself still lets the user pick
 * any location, but we must not propose a malicious default.
 *
 * - Strips any directory components (returns basename only).
 * - Rejects empty names, "." and "..".
 * - Rejects control characters and invalid Windows filename chars.
 * - Truncates to 200 chars.
 * - Ensures the name ends with `.csv` (case-insensitive); appends if missing.
 */
export function sanitizeCsvFilename(raw: string): string {
  if (typeof raw !== 'string') {
    throw new Error('Filename must be a string');
  }
  // Remove any directory path — keep only the final segment.
  const basename = raw.split(/[\\/]/).pop() ?? '';
  const trimmed = basename.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Invalid filename');
  }
  // Reject control chars and platform-reserved chars.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f<>:"|?*]/.test(trimmed)) {
    throw new Error('Filename contains invalid characters');
  }
  let safe = trimmed.slice(0, 200);
  if (!/\.csv$/i.test(safe)) {
    safe = `${safe}.csv`;
  }
  return safe;
}
