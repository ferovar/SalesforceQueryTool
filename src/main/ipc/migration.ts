/**
 * IPC handlers for data migration between Salesforce orgs.
 */

import { SalesforceService } from '../services/salesforce';
import { CredentialsStore } from '../services/credentials';
import { OrgConnectionManager } from '../services/orgConnectionManager';
import { DataMigrationService, RelationshipConfig, DEFAULT_EXCLUDED_FIELDS, DEFAULT_EXCLUDED_OBJECTS } from '../services/dataMigration';
import {
  buildIdInClause,
  buildSoqlValue,
  isValidSalesforceId,
  validateApiName,
} from '../services/soqlUtils';
import { handleIpc, handleIpcRaw } from './handler';
import { requireString, requireApiName } from './validate';

// Compound/read-only fields that should be excluded from insert/update
const COMPOUND_READ_ONLY_FIELDS = new Set([
  'Name',
  'PhotoUrl',
  'IsDeleted',
  'CreatedDate',
  'CreatedById',
  'LastModifiedDate',
  'LastModifiedById',
  'SystemModstamp',
  'LastActivityDate',
  'LastViewedDate',
  'LastReferencedDate',
  'MasterRecordId',
]);

// Object-specific compound fields
const OBJECT_COMPOUND_FIELDS: Record<string, Set<string>> = {
  'Contact': new Set(['Name', 'MailingAddress', 'OtherAddress']),
  'Lead': new Set(['Name', 'Address']),
  'Account': new Set(['BillingAddress', 'ShippingAddress']),
  'User': new Set(['Name', 'Address']),
};

// Guard against concurrent migration execution
let migrationInProgress = false;

export function registerMigrationHandlers(
  salesforceService: SalesforceService,
  credentialsStore: CredentialsStore,
  orgConnectionManager: OrgConnectionManager,
): void {
  // Lazily initialized per-request
  let dataMigrationService: DataMigrationService | null = null;

  function getOrCreateMigrationService(): DataMigrationService {
    const connection = salesforceService.getConnection();
    if (!connection) {
      throw new Error('Not connected to source org');
    }
    if (!dataMigrationService) {
      dataMigrationService = new DataMigrationService(connection);
    }
    return dataMigrationService;
  }

  handleIpc('migration:connectTargetOrg', async (options: { isSandbox: boolean; label: string; clientId?: string }) => {
    return orgConnectionManager.connectWithOAuth(!!options.isSandbox, options.clientId, options.label || '');
  });

  handleIpc('migration:connectWithSavedOAuth', async (savedOAuthId: string) => {
    requireString(savedOAuthId, 'saved OAuth ID');
    const savedOAuth = credentialsStore.getOAuthLoginById(savedOAuthId);
    if (!savedOAuth) {
      throw new Error('Saved OAuth connection not found');
    }
    return orgConnectionManager.connectWithToken(
      savedOAuth.instanceUrl,
      savedOAuth.accessToken,
      savedOAuth.isSandbox,
      savedOAuth.username
    );
  });

  handleIpc('migration:connectWithSavedCredentials', async (username: string) => {
    requireString(username, 'username');
    const savedCredentials = credentialsStore.getLoginByUsername(username);
    if (!savedCredentials) {
      throw new Error('Saved credentials not found');
    }
    return orgConnectionManager.connectWithPassword(
      savedCredentials.username,
      savedCredentials.password,
      savedCredentials.securityToken,
      savedCredentials.isSandbox,
      savedCredentials.label || savedCredentials.username
    );
  });

  handleIpcRaw('migration:getTargetOrgs', () => {
    return orgConnectionManager.getAllConnections().map(c => ({
      id: c.id,
      label: c.label,
      instanceUrl: c.instanceUrl,
      username: c.username,
      isSandbox: c.isSandbox,
    }));
  });

  handleIpc('migration:disconnectTargetOrg', async (connectionId: string) => {
    requireString(connectionId, 'connection ID');
    await orgConnectionManager.disconnect(connectionId);
  });

  handleIpc('migration:getRelationships', async (objectName: string) => {
    requireApiName(objectName, 'object name');
    const svc = getOrCreateMigrationService();
    const relationships = await svc.getRelationships(objectName);
    const defaultConfig = await svc.getDefaultRelationshipConfig(objectName);
    return {
      relationships,
      defaultConfig,
      excludedFields: DEFAULT_EXCLUDED_FIELDS,
      excludedObjects: DEFAULT_EXCLUDED_OBJECTS,
    };
  });

  handleIpc('migration:analyzeRecords', async (params: {
    objectName: string;
    records: Record<string, any>[];
    relationshipConfig: RelationshipConfig[];
  }) => {
    requireString(params.objectName, 'object name');
    const svc = getOrCreateMigrationService();

    const analyzed = await svc.analyzeRelationships(
      params.objectName,
      params.records,
      params.relationshipConfig
    );

    const plan = svc.buildMigrationPlan(analyzed);

    const recordsByObjectSerialized: Record<string, Record<string, any>[]> = {};
    for (const [key, value] of plan.recordsByObject) {
      recordsByObjectSerialized[key] = value;
    }

    return {
      objectOrder: plan.objectOrder,
      recordsByObject: recordsByObjectSerialized,
      totalRecords: plan.totalRecords,
      objectCounts: plan.objectCounts,
      relationshipRemapping: plan.relationshipRemapping,
    };
  });

  handleIpc('migration:executeMigration', async (params: {
    targetOrgId: string;
    objectOrder: string[];
    recordsByObject: Record<string, Record<string, any>[]>;
    relationshipRemapping: { objectName: string; fieldName: string; originalId: string; recordIndex: number }[];
    relationshipConfig?: RelationshipConfig[];
  }) => {
    if (migrationInProgress) {
      throw new Error('A migration is already in progress. Please wait for it to complete.');
    }

    migrationInProgress = true;
    try {
      return await executeMigration(params, salesforceService, orgConnectionManager);
    } finally {
      migrationInProgress = false;
    }
  });

  handleIpc('migration:getChildRelationships', async (objectName: string) => {
    requireApiName(objectName, 'object name');
    const svc = getOrCreateMigrationService();
    return svc.getChildRelationships(objectName);
  });

  handleIpc('migration:getExternalIdFields', async (objectName: string) => {
    requireApiName(objectName, 'object name');
    const connection = salesforceService.getConnection();
    if (!connection) {
      throw new Error('Not connected to source org');
    }

    const description = await connection.describe(objectName);

    return description.fields
      .filter((field: any) =>
        field.externalId === true ||
        (field.idLookup === true && field.name !== 'Id') ||
        field.name === 'Name'
      )
      .map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        isExternalId: field.externalId === true,
        isUnique: field.unique === true,
      }));
  });
}

// ─── Migration execution logic ──────────────────────────────────────────────

async function executeMigration(
  params: {
    targetOrgId: string;
    objectOrder: string[];
    recordsByObject: Record<string, Record<string, any>[]>;
    relationshipRemapping: { objectName: string; fieldName: string; originalId: string; recordIndex: number }[];
    relationshipConfig?: RelationshipConfig[];
  },
  salesforceService: SalesforceService,
  orgConnectionManager: OrgConnectionManager,
) {
  const { targetOrgId, objectOrder, recordsByObject, relationshipRemapping, relationshipConfig } = params;

  const idMapping = new Map<string, string>();
  const results: { objectName: string; inserted: number; failed: number; errors: string[] }[] = [];

  const sourceConnection = salesforceService.getConnection();

  // ── External ID lookups ───────────────────────────────────────────────
  const externalIdMappings = relationshipConfig?.filter(c =>
    c.action === 'matchByExternalId' &&
    c.externalIdField &&
    c.fieldName !== 'RecordTypeId'
  ) || [];

  if (externalIdMappings.length > 0 && sourceConnection) {
    for (const config of externalIdMappings) {
      const sourceIds = new Set<string>();
      for (const records of Object.values(recordsByObject)) {
        for (const record of records) {
          const value = record[config.fieldName];
          if (value && typeof value === 'string') {
            sourceIds.add(value);
          }
        }
      }

      if (sourceIds.size === 0) continue;

      try {
        const safeField = validateApiName(config.externalIdField!, 'external ID field');
        const safeObject = validateApiName(config.referenceTo, 'reference object');
        const validSourceIds = Array.from(sourceIds).filter(id => isValidSalesforceId(id));
        if (validSourceIds.length === 0) continue;

        const sourceQuery = `SELECT Id, ${safeField} FROM ${safeObject} WHERE Id IN ${buildIdInClause(validSourceIds)}`;
        const sourceResult = await sourceConnection.query(sourceQuery);

        const sourceIdToExternalValue = new Map<string, any>();
        for (const record of sourceResult.records as any[]) {
          if (record[config.externalIdField!] != null) {
            sourceIdToExternalValue.set(record.Id, record[config.externalIdField!]);
          }
        }

        const externalValues = new Set(sourceIdToExternalValue.values());
        if (externalValues.size === 0) continue;

        const escapedValues = Array.from(externalValues).map(v => buildSoqlValue(v));
        const targetQuery = `SELECT Id, ${safeField} FROM ${safeObject} WHERE ${safeField} IN (${escapedValues.join(',')})`;
        const targetResult = await orgConnectionManager.executeQuery(targetOrgId, targetQuery);

        const externalValueToTargetId = new Map<any, string>();
        for (const record of targetResult as any[]) {
          externalValueToTargetId.set(record[config.externalIdField!], record.Id);
        }

        for (const [sourceId, externalValue] of sourceIdToExternalValue) {
          const targetId = externalValueToTargetId.get(externalValue);
          if (targetId) {
            idMapping.set(sourceId, targetId);
          }
        }
      } catch (err) {
        console.error(`Error performing external ID lookup for ${config.fieldName}:`, err);
      }
    }
  }

  // ── RecordType mapping ────────────────────────────────────────────────
  const recordTypeMapping = new Map<string, string>();

  const hasRecordTypeFields = Object.values(recordsByObject).some(records =>
    records.some(record => record.RecordTypeId)
  );

  if (hasRecordTypeFields) {
    const targetRecordTypes = await orgConnectionManager.getRecordTypeMapping(targetOrgId);

    if (sourceConnection) {
      const sourceRecordTypeIds = new Set<string>();
      for (const records of Object.values(recordsByObject)) {
        for (const record of records) {
          if (record.RecordTypeId) {
            sourceRecordTypeIds.add(record.RecordTypeId);
          }
        }
      }

      const validRecordTypeIds = Array.from(sourceRecordTypeIds).filter(id => isValidSalesforceId(id));
      if (validRecordTypeIds.length > 0) {
        const sourceQuery = `SELECT Id, SobjectType, DeveloperName FROM RecordType WHERE Id IN ${buildIdInClause(validRecordTypeIds)}`;
        const sourceRecordTypes = await sourceConnection.query(sourceQuery);

        for (const srcRT of sourceRecordTypes.records as any[]) {
          const key = `${srcRT.SobjectType}:${srcRT.DeveloperName}`;
          const targetRT = targetRecordTypes.get(key);
          if (targetRT) {
            recordTypeMapping.set(srcRT.Id, targetRT.id);
            idMapping.set(srcRT.Id, targetRT.id);
          }
        }
      }
    }
  }

  // ── Insert records in dependency order ────────────────────────────────
  for (const objectName of objectOrder) {
    if (objectName === 'RecordType') {
      results.push({ objectName, inserted: 0, failed: 0, errors: ['RecordTypes are matched by DeveloperName, not inserted'] });
      continue;
    }

    const records = recordsByObject[objectName] || [];
    if (records.length === 0) continue;

    const objectSpecificExclusions = OBJECT_COMPOUND_FIELDS[objectName] || new Set();

    const fieldsToSkip = new Set<string>();
    if (relationshipConfig) {
      for (const config of relationshipConfig) {
        if (config.action === 'skip') {
          fieldsToSkip.add(config.fieldName);
        }
      }
    }

    const preparedRecords = records.map(record => {
      const prepared: Record<string, any> = {};

      for (const [key, value] of Object.entries(record)) {
        if (key === '_originalId' || key === '_tempId') continue;
        if (COMPOUND_READ_ONLY_FIELDS.has(key) || objectSpecificExclusions.has(key)) continue;
        if (fieldsToSkip.has(key)) continue;

        if (key === 'RecordTypeId' && value) {
          prepared[key] = recordTypeMapping.has(value as string)
            ? recordTypeMapping.get(value as string)
            : null;
        } else if (value && typeof value === 'string' && idMapping.has(value)) {
          prepared[key] = idMapping.get(value);
        } else {
          prepared[key] = value;
        }
      }

      return prepared;
    });

    const insertResults = await orgConnectionManager.insertRecords(targetOrgId, objectName, preparedRecords);

    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    insertResults.forEach((result, index) => {
      if (result.success) {
        inserted++;
        const originalId = records[index]._originalId;
        if (originalId) {
          idMapping.set(originalId, result.id);
        }
      } else {
        failed++;
        errors.push(`Record ${index + 1}: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    });

    results.push({ objectName, inserted, failed, errors });
  }

  // ── Build response ────────────────────────────────────────────────────
  const idMappingSerialized: Record<string, string> = {};
  for (const [key, value] of idMapping) {
    idMappingSerialized[key] = value;
  }

  return {
    results,
    idMapping: idMappingSerialized,
    totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
    totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
  };
}
