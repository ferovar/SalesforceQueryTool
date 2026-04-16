import {
  flattenRecord,
  recordsToCsv,
  sanitizeCsvFilename,
} from '../csvExport';

describe('flattenRecord', () => {
  it('flattens nested objects with dot-notation keys', () => {
    const input = {
      Id: '001',
      Account: { Name: 'Acme', Owner: { Email: 'a@b.com' } },
    };
    expect(flattenRecord(input)).toEqual({
      Id: '001',
      'Account.Name': 'Acme',
      'Account.Owner.Email': 'a@b.com',
    });
  });

  it('skips Salesforce "attributes" metadata at any depth', () => {
    const input = {
      attributes: { type: 'Contact', url: '/x' },
      Name: 'Jane',
      Account: {
        attributes: { type: 'Account' },
        Name: 'Acme',
      },
    };
    expect(flattenRecord(input)).toEqual({
      Name: 'Jane',
      'Account.Name': 'Acme',
    });
  });

  it('keeps arrays and primitives as-is', () => {
    const input = { tags: ['a', 'b'], n: 3, done: true, empty: null };
    expect(flattenRecord(input)).toEqual({
      tags: ['a', 'b'],
      n: 3,
      done: true,
      empty: null,
    });
  });
});

describe('recordsToCsv', () => {
  it('produces header row + data rows with dot-notation headers', () => {
    const csv = recordsToCsv([
      { Id: '001', Account: { Name: 'Acme' } },
      { Id: '002', Account: { Name: 'Beta' } },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Id","Account.Name"');
    expect(lines[1]).toBe('"001","Acme"');
    expect(lines[2]).toBe('"002","Beta"');
  });

  it('includes the union of keys across records', () => {
    const csv = recordsToCsv([{ a: 1 }, { b: 2 }]);
    expect(csv.split('\n')[0]).toBe('"a","b"');
    expect(csv.split('\n')[1]).toBe('"1",');
    expect(csv.split('\n')[2]).toBe(',"2"');
  });

  it('escapes embedded double quotes per RFC 4180', () => {
    const csv = recordsToCsv([{ note: 'she said "hi"' }]);
    expect(csv.split('\n')[1]).toBe('"she said ""hi"""');
  });

  it('renders null/undefined as empty cells', () => {
    const csv = recordsToCsv([{ a: null, b: undefined, c: 'x' }]);
    expect(csv.split('\n')[1]).toBe(',,"x"');
  });

  it('JSON-encodes array values', () => {
    const csv = recordsToCsv([{ tags: ['x', 'y'] }]);
    // JSON quotes get escaped to "" per CSV rules.
    expect(csv.split('\n')[1]).toBe('"[""x"",""y""]"');
  });

  it('throws for empty input', () => {
    expect(() => recordsToCsv([])).toThrow('No data to export');
  });
});

describe('sanitizeCsvFilename', () => {
  it('strips directory traversal components', () => {
    expect(sanitizeCsvFilename('../../etc/passwd.csv')).toBe('passwd.csv');
    expect(sanitizeCsvFilename('..\\..\\Windows\\evil.csv')).toBe('evil.csv');
    expect(sanitizeCsvFilename('/abs/path/file.csv')).toBe('file.csv');
  });

  it('appends .csv when missing', () => {
    expect(sanitizeCsvFilename('report')).toBe('report.csv');
  });

  it('preserves existing .csv (case-insensitive)', () => {
    expect(sanitizeCsvFilename('Report.CSV')).toBe('Report.CSV');
  });

  it('rejects empty, "." and ".."', () => {
    expect(() => sanitizeCsvFilename('')).toThrow();
    expect(() => sanitizeCsvFilename('  ')).toThrow();
    expect(() => sanitizeCsvFilename('.')).toThrow();
    expect(() => sanitizeCsvFilename('..')).toThrow();
  });

  it('rejects control characters and reserved shell chars', () => {
    expect(() => sanitizeCsvFilename('bad\x00.csv')).toThrow();
    expect(() => sanitizeCsvFilename('a<b>.csv')).toThrow();
    expect(() => sanitizeCsvFilename('a|b.csv')).toThrow();
    expect(() => sanitizeCsvFilename('a?.csv')).toThrow();
  });

  it('truncates very long names but still ends with .csv', () => {
    const long = 'a'.repeat(500);
    const out = sanitizeCsvFilename(long);
    expect(out.length).toBeLessThanOrEqual(204);
    expect(out.endsWith('.csv')).toBe(true);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error intentional bad input
    expect(() => sanitizeCsvFilename(undefined)).toThrow();
    // @ts-expect-error intentional bad input
    expect(() => sanitizeCsvFilename(42)).toThrow();
  });
});
