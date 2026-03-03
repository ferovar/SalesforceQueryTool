/**
 * IPC input validation utilities.
 *
 * These are used at the IPC boundary to validate parameters
 * before they reach business logic.
 */

import { isValidSalesforceId, isValidApiName } from '../services/soqlUtils';

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required and must be a non-empty string`);
  }
  return value;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error('Expected a string');
  }
  return value;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expected a number');
  }
  return value;
}

export function requireSalesforceId(value: unknown, label: string): string {
  const str = requireString(value, label);
  if (!isValidSalesforceId(str)) {
    throw new Error(`${label} is not a valid Salesforce ID`);
  }
  return str;
}

export function requireApiName(value: unknown, label: string): string {
  const str = requireString(value, label);
  if (!isValidApiName(str)) {
    throw new Error(`${label} is not a valid Salesforce API name`);
  }
  return str;
}

export function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
