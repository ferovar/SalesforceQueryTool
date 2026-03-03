import {
  requireString,
  requireBoolean,
  optionalString,
  optionalNumber,
  requireSalesforceId,
  requireApiName,
  requireNumber,
  requireArray,
  requireObject,
} from '../ipc/validate';

describe('IPC validation utilities', () => {
  describe('requireString', () => {
    it('should return the string if valid', () => {
      expect(requireString('hello', 'test')).toBe('hello');
    });

    it('should throw for empty string', () => {
      expect(() => requireString('', 'test')).toThrow('test is required');
    });

    it('should throw for non-string', () => {
      expect(() => requireString(42, 'test')).toThrow('test is required');
      expect(() => requireString(null, 'test')).toThrow('test is required');
      expect(() => requireString(undefined, 'test')).toThrow('test is required');
    });
  });

  describe('requireBoolean', () => {
    it('should return boolean values', () => {
      expect(requireBoolean(true, 'test')).toBe(true);
      expect(requireBoolean(false, 'test')).toBe(false);
    });

    it('should throw for non-boolean', () => {
      expect(() => requireBoolean('true', 'test')).toThrow('test must be a boolean');
      expect(() => requireBoolean(1, 'test')).toThrow('test must be a boolean');
    });
  });

  describe('optionalString', () => {
    it('should return undefined for null/undefined', () => {
      expect(optionalString(undefined)).toBeUndefined();
      expect(optionalString(null)).toBeUndefined();
    });

    it('should return the string if valid', () => {
      expect(optionalString('hello')).toBe('hello');
    });

    it('should throw for non-string non-null', () => {
      expect(() => optionalString(42)).toThrow('Expected a string');
    });
  });

  describe('optionalNumber', () => {
    it('should return undefined for null/undefined', () => {
      expect(optionalNumber(undefined)).toBeUndefined();
      expect(optionalNumber(null)).toBeUndefined();
    });

    it('should return the number if valid', () => {
      expect(optionalNumber(42)).toBe(42);
    });

    it('should throw for non-number', () => {
      expect(() => optionalNumber('42')).toThrow('Expected a number');
    });
  });

  describe('requireSalesforceId', () => {
    it('should accept valid Salesforce IDs', () => {
      expect(requireSalesforceId('001000000000001', 'id')).toBe('001000000000001');
    });

    it('should throw for invalid IDs', () => {
      expect(() => requireSalesforceId('bad', 'id')).toThrow('not a valid Salesforce ID');
    });

    it('should throw for non-strings', () => {
      expect(() => requireSalesforceId(42, 'id')).toThrow('id is required');
    });
  });

  describe('requireApiName', () => {
    it('should accept valid API names', () => {
      expect(requireApiName('Account', 'name')).toBe('Account');
    });

    it('should throw for invalid API names', () => {
      expect(() => requireApiName("'; DROP TABLE--", 'name')).toThrow('not a valid Salesforce API name');
    });
  });

  describe('requireNumber', () => {
    it('should accept valid numbers', () => {
      expect(requireNumber(42, 'test')).toBe(42);
      expect(requireNumber(0, 'test')).toBe(0);
      expect(requireNumber(-1, 'test')).toBe(-1);
    });

    it('should reject non-numbers', () => {
      expect(() => requireNumber('42', 'test')).toThrow('test must be a number');
      expect(() => requireNumber(NaN, 'test')).toThrow('test must be a number');
      expect(() => requireNumber(Infinity, 'test')).toThrow('test must be a number');
    });
  });

  describe('requireArray', () => {
    it('should accept arrays', () => {
      expect(requireArray([], 'test')).toEqual([]);
      expect(requireArray([1, 2], 'test')).toEqual([1, 2]);
    });

    it('should reject non-arrays', () => {
      expect(() => requireArray({}, 'test')).toThrow('test must be an array');
      expect(() => requireArray('arr', 'test')).toThrow('test must be an array');
    });
  });

  describe('requireObject', () => {
    it('should accept objects', () => {
      expect(requireObject({}, 'test')).toEqual({});
      expect(requireObject({ a: 1 }, 'test')).toEqual({ a: 1 });
    });

    it('should reject non-objects', () => {
      expect(() => requireObject(null, 'test')).toThrow('test must be an object');
      expect(() => requireObject([], 'test')).toThrow('test must be an object');
      expect(() => requireObject('obj', 'test')).toThrow('test must be an object');
    });
  });
});
