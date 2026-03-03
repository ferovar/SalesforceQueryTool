import {
  isValidSalesforceId,
  escapeSoqlString,
  escapeSoqlLikeString,
  buildIdInClause,
  buildStringInClause,
  buildSoqlValue,
  isValidApiName,
  validateApiName,
  validateLimit,
  isValidDatetime,
  validateDatetime,
} from '../services/soqlUtils';

describe('soqlUtils', () => {
  describe('isValidSalesforceId', () => {
    it('should accept valid 15-character IDs', () => {
      expect(isValidSalesforceId('001000000000001')).toBe(true);
      expect(isValidSalesforceId('005xx0000012345')).toBe(true);
    });

    it('should accept valid 18-character IDs', () => {
      expect(isValidSalesforceId('001000000000001AAA')).toBe(true);
      expect(isValidSalesforceId('005xx0000012345Abc')).toBe(true);
    });

    it('should reject invalid IDs', () => {
      expect(isValidSalesforceId('')).toBe(false);
      expect(isValidSalesforceId('short')).toBe(false);
      expect(isValidSalesforceId("001' OR 1=1--")).toBe(false);
      expect(isValidSalesforceId('001000000000001!')).toBe(false);
      expect(isValidSalesforceId('0010000000000019999')).toBe(false); // 19 chars
    });
  });

  describe('escapeSoqlString', () => {
    it('should escape single quotes', () => {
      expect(escapeSoqlString("O'Brien")).toBe("O\\'Brien");
    });

    it('should escape backslashes before quotes', () => {
      expect(escapeSoqlString("test\\value")).toBe("test\\\\value");
      expect(escapeSoqlString("it\\'s")).toBe("it\\\\\\'s");
    });

    it('should escape double quotes', () => {
      expect(escapeSoqlString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines and tabs', () => {
      expect(escapeSoqlString("line1\nline2")).toBe("line1\\nline2");
      expect(escapeSoqlString("col1\tcol2")).toBe("col1\\tcol2");
    });

    it('should handle empty strings', () => {
      expect(escapeSoqlString('')).toBe('');
    });
  });

  describe('escapeSoqlLikeString', () => {
    it('should escape LIKE wildcards in addition to standard escaping', () => {
      expect(escapeSoqlLikeString('100%')).toBe('100\\%');
      expect(escapeSoqlLikeString('test_value')).toBe('test\\_value');
    });

    it('should escape both quotes and LIKE wildcards', () => {
      expect(escapeSoqlLikeString("O'Brien_100%")).toBe("O\\'Brien\\_100\\%");
    });
  });

  describe('buildIdInClause', () => {
    it('should build a valid IN clause for valid IDs', () => {
      const ids = ['001000000000001', '001000000000002'];
      expect(buildIdInClause(ids)).toBe("('001000000000001','001000000000002')");
    });

    it('should return empty IN clause for empty array', () => {
      expect(buildIdInClause([])).toBe("('')");
    });

    it('should throw for invalid IDs', () => {
      expect(() => buildIdInClause(['invalid'])).toThrow('Invalid Salesforce ID');
    });

    it('should throw when any ID is invalid', () => {
      expect(() => buildIdInClause(['001000000000001', "' OR 1=1"])).toThrow('Invalid Salesforce ID');
    });
  });

  describe('buildStringInClause', () => {
    it('should properly escape string values', () => {
      const values = ['hello', "O'Brien"];
      expect(buildStringInClause(values)).toBe("('hello','O\\'Brien')");
    });

    it('should return empty IN clause for empty array', () => {
      expect(buildStringInClause([])).toBe("('')");
    });
  });

  describe('buildSoqlValue', () => {
    it('should quote and escape strings', () => {
      expect(buildSoqlValue("hello")).toBe("'hello'");
      expect(buildSoqlValue("O'Brien")).toBe("'O\\'Brien'");
    });

    it('should not quote numbers', () => {
      expect(buildSoqlValue(42)).toBe('42');
      expect(buildSoqlValue(3.14)).toBe('3.14');
    });

    it('should not quote booleans', () => {
      expect(buildSoqlValue(true)).toBe('true');
      expect(buildSoqlValue(false)).toBe('false');
    });
  });

  describe('isValidApiName', () => {
    it('should accept valid API names', () => {
      expect(isValidApiName('Account')).toBe(true);
      expect(isValidApiName('Custom_Object__c')).toBe(true);
      expect(isValidApiName('Profile.Name')).toBe(true);
      expect(isValidApiName('ns__Field__c')).toBe(true);
    });

    it('should reject invalid API names', () => {
      expect(isValidApiName('')).toBe(false);
      expect(isValidApiName("'; DROP TABLE--")).toBe(false);
      expect(isValidApiName('123start')).toBe(false);
      expect(isValidApiName('has space')).toBe(false);
    });
  });

  describe('validateApiName', () => {
    it('should return the name if valid', () => {
      expect(validateApiName('Account')).toBe('Account');
    });

    it('should throw with label if invalid', () => {
      expect(() => validateApiName('bad name!', 'field name')).toThrow('Invalid field name');
    });
  });

  describe('validateLimit', () => {
    it('should accept valid limits', () => {
      expect(validateLimit(1)).toBe(1);
      expect(validateLimit(50000)).toBe(50000);
      expect(validateLimit(100)).toBe(100);
    });

    it('should reject invalid limits', () => {
      expect(() => validateLimit(0)).toThrow('Invalid LIMIT');
      expect(() => validateLimit(-1)).toThrow('Invalid LIMIT');
      expect(() => validateLimit(50001)).toThrow('Invalid LIMIT');
      expect(() => validateLimit(NaN)).toThrow('Invalid LIMIT');
      expect(() => validateLimit(Infinity)).toThrow('Invalid LIMIT');
    });

    it('should floor decimal values', () => {
      expect(validateLimit(10.9)).toBe(10);
    });
  });

  describe('isValidDatetime / validateDatetime', () => {
    it('should accept valid ISO 8601 datetimes', () => {
      expect(isValidDatetime('2024-01-15T10:30:00.000Z')).toBe(true);
      expect(isValidDatetime('2024-01-15T10:30:00Z')).toBe(true);
      expect(isValidDatetime('2024-01-15T10:30:00+05:30')).toBe(true);
    });

    it('should reject invalid datetimes', () => {
      expect(isValidDatetime('not-a-date')).toBe(false);
      expect(isValidDatetime("2024-01-15' OR 1=1")).toBe(false);
      expect(isValidDatetime('')).toBe(false);
    });

    it('validateDatetime should throw for invalid values', () => {
      expect(() => validateDatetime('bad')).toThrow('Invalid datetime');
    });
  });
});
