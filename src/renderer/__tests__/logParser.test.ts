import { parseDebugLog, getLogLineColor } from '../utils/logParser';

describe('logParser', () => {
  describe('parseDebugLog', () => {
    it('should parse a USER_DEBUG line', () => {
      const log = '10:30:00.123 (12345678)|USER_DEBUG|[5]|DEBUG|Hello World';
      const result = parseDebugLog(log);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('user-debug');
      expect(result[0].timestamp).toBe('10:30:00.123');
      expect(result[0].category).toBe('USER_DEBUG');
    });

    it('should parse an ERROR line', () => {
      const log = '10:30:00.123 (12345678)|FATAL_ERROR|System.QueryException';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('error');
    });

    it('should parse a DML line', () => {
      const log = '10:30:00.123 (12345678)|DML_BEGIN|[10]|Op:Insert|Type:Account';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('dml');
    });

    it('should parse a SOQL line', () => {
      const log = '10:30:00.123 (12345678)|SOQL_EXECUTE_BEGIN|[15]|Aggregations:0';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('soql');
    });

    it('should parse SYSTEM lines', () => {
      const log = '10:30:00.123 (12345678)|SYSTEM_MODE_ENTER|true';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('system');
    });

    it('should detect DEBUG keyword in non-standard format', () => {
      const log = 'Something DEBUG| here';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('user-debug');
    });

    it('should detect error keyword in plain text', () => {
      const log = 'An error occurred during processing';
      const result = parseDebugLog(log);
      expect(result[0].type).toBe('error');
    });

    it('should handle empty log', () => {
      expect(parseDebugLog('')).toHaveLength(1);
      expect(parseDebugLog('')[0].type).toBe('default');
    });

    it('should handle multiline log', () => {
      const log = '10:30:00.123 (1)|USER_DEBUG|debug msg\n10:30:01.456 (2)|DML_BEGIN|dml msg';
      const result = parseDebugLog(log);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('user-debug');
      expect(result[1].type).toBe('dml');
    });
  });

  describe('getLogLineColor', () => {
    it('should return correct colors for each type', () => {
      expect(getLogLineColor('user-debug')).toBe('text-cyan-400');
      expect(getLogLineColor('error')).toBe('text-red-400');
      expect(getLogLineColor('warning')).toBe('text-yellow-400');
      expect(getLogLineColor('info')).toBe('text-blue-400');
      expect(getLogLineColor('dml')).toBe('text-purple-400');
      expect(getLogLineColor('soql')).toBe('text-green-400');
      expect(getLogLineColor('limit')).toBe('text-orange-400');
      expect(getLogLineColor('system')).toBe('text-gray-500');
      expect(getLogLineColor('default')).toBe('text-discord-text-muted');
    });
  });
});
