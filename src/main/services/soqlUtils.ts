/**
 * SOQL escaping and validation utilities.
 *
 * Provides safe query construction helpers so that user-controlled values
 * are never interpolated directly into SOQL strings.
 */

// Salesforce IDs are 15 or 18 alphanumeric characters
const SFID_PATTERN = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

/**
 * Validate that a string looks like a Salesforce 15/18-character ID.
 */
export function isValidSalesforceId(value: string): boolean {
  return SFID_PATTERN.test(value);
}

/**
 * Escape a string value for use inside SOQL single-quoted literals.
 *
 * SOQL reserves the following characters inside string literals:
 *   '  (single quote)  →  \'
 *   \  (backslash)     →  \\
 *   "  (double quote)  →  \"
 *   \n (newline)       →  \n
 *   \r (carriage ret)  →  \r
 *   \t (tab)           →  \t
 *   %  and _ are LIKE wildcards but are literal in = comparisons.
 *
 * See: https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_quotedstringescapes.htm
 */
export function escapeSoqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Escape a string value for use inside a SOQL LIKE clause.
 *
 * In addition to standard string escaping, LIKE wildcards % and _ must
 * be escaped so they are treated as literal characters when providing
 * a user-supplied search term.
 */
export function escapeSoqlLikeString(value: string): string {
  // First escape standard SOQL characters, then escape LIKE wildcards
  return escapeSoqlString(value)
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Safely build an IN clause from a list of Salesforce IDs.
 *
 * Validates each ID and throws if any are invalid. Returns a string
 * like: `('001xx000003DGbA','001xx000003DGbB')`
 */
export function buildIdInClause(ids: string[]): string {
  if (ids.length === 0) return "('')";

  const invalid = ids.filter(id => !isValidSalesforceId(id));
  if (invalid.length > 0) {
    throw new Error(`Invalid Salesforce ID(s): ${invalid.slice(0, 5).join(', ')}`);
  }

  return `('${ids.join("','")}')`;
}

/**
 * Safely build an IN clause from arbitrary string values (not IDs).
 *
 * Escapes each value for SOQL string literals.
 * Returns a string like: `('value1','value2')`
 */
export function buildStringInClause(values: string[]): string {
  if (values.length === 0) return "('')";
  return `('${values.map(escapeSoqlString).join("','")}')`;
}

/**
 * Build a quoted, escaped value for use in SOQL comparisons.
 * Handles string and non-string values appropriately.
 *
 * For string values: `'escaped_value'`
 * For numeric/boolean: raw value
 */
export function buildSoqlValue(value: unknown): string {
  if (typeof value === 'string') {
    return `'${escapeSoqlString(value)}'`;
  }
  return String(value);
}

/**
 * Validate that a string is a valid Salesforce API name (object or field).
 *
 * API names consist of alphanumeric characters, underscores, and may end
 * with `__c`, `__r`, etc. Dot notation (e.g., `Profile.Name`) is allowed
 * for relationship field traversal.
 */
const API_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]*$/;

export function isValidApiName(name: string): boolean {
  return API_NAME_PATTERN.test(name) && name.length <= 255;
}

/**
 * Validate and return the API name, or throw if it looks suspicious.
 */
export function validateApiName(name: string, label: string = 'API name'): string {
  if (!isValidApiName(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
  return name;
}

/**
 * Validate a numeric SOQL LIMIT value.
 */
export function validateLimit(limit: number): number {
  const n = Math.floor(limit);
  if (!Number.isFinite(n) || n < 1 || n > 50000) {
    throw new Error(`Invalid LIMIT value: ${limit}`);
  }
  return n;
}

/**
 * Validate an ISO 8601 datetime string for SOQL datetime literals.
 */
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidDatetime(value: string): boolean {
  return ISO_DATETIME_PATTERN.test(value);
}

export function validateDatetime(value: string, label: string = 'datetime'): string {
  if (!isValidDatetime(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}
