import * as jsforce from 'jsforce';

export interface FieldRelationship {
  fieldName: string;
  fieldLabel: string;
  referenceTo: string[];
  relationshipName: string | null;
  isRequired: boolean;
  isCreateable: boolean;
}

export interface RelationshipConfig {
  fieldName: string;
  include: boolean;
  referenceTo: string; // The specific object to reference (when multiple options)
}

export interface RecordWithRelationships {
  objectName: string;
  record: Record<string, any>;
  relationships: {
    fieldName: string;
    relatedRecords: RecordWithRelationships[];
  }[];
}

export interface MigrationPlan {
  // Records grouped by object, in insertion order (parents before children)
  objectOrder: string[];
  recordsByObject: Map<string, Record<string, any>[]>;
  // Map of original IDs to track what needs to be remapped
  idMapping: Map<string, string>;
  // Relationship fields that need remapping after insertion
  relationshipRemapping: {
    objectName: string;
    fieldName: string;
    originalId: string;
    recordIndex: number;
  }[];
  // Statistics
  totalRecords: number;
  objectCounts: Record<string, number>;
}

export interface MigrationResult {
  success: boolean;
  insertedRecords: number;
  failedRecords: number;
  errors: { objectName: string; recordId: string; error: string }[];
  idMapping: Map<string, string>;
}

// Default fields to exclude from migration (user/owner references, system fields)
export const DEFAULT_EXCLUDED_FIELDS = [
  'OwnerId',
  'CreatedById',
  'LastModifiedById',
  'CreatedDate',
  'LastModifiedDate',
  'SystemModstamp',
  'LastActivityDate',
  'LastViewedDate',
  'LastReferencedDate',
  'IsDeleted',
  'MasterRecordId', // System field for merged records - not writable
];

// Default relationship objects to exclude (users, org-specific)
export const DEFAULT_EXCLUDED_OBJECTS = [
  'User',
  'Group',
  'Profile',
  'UserRole',
  'Organization',
  // Note: RecordType is NOT excluded - RecordTypeId should be migrated
  // The RecordType IDs may differ between orgs, but we let the user handle that
];

/**
 * Service for analyzing record relationships and managing data migration
 */
export class DataMigrationService {
  private sourceConnection: jsforce.Connection;
  private objectDescriptions: Map<string, any> = new Map();

  constructor(sourceConnection: jsforce.Connection) {
    this.sourceConnection = sourceConnection;
  }

  /**
   * Get the object description, with caching
   */
  async getObjectDescription(objectName: string): Promise<any> {
    if (!this.objectDescriptions.has(objectName)) {
      const description = await this.sourceConnection.describe(objectName);
      this.objectDescriptions.set(objectName, description);
    }
    return this.objectDescriptions.get(objectName);
  }

  /**
   * Get all lookup/reference relationships for an object
   */
  async getRelationships(objectName: string): Promise<FieldRelationship[]> {
    const description = await this.getObjectDescription(objectName);
    
    return description.fields
      .filter((field: any) => 
        field.type === 'reference' && 
        field.referenceTo && 
        field.referenceTo.length > 0
      )
      .map((field: any) => ({
        fieldName: field.name,
        fieldLabel: field.label,
        referenceTo: field.referenceTo,
        relationshipName: field.relationshipName,
        isRequired: !field.nillable,
        isCreateable: field.createable,
      }));
  }

  /**
   * Analyze records and find all related records that need to be migrated
   */
  async analyzeRelationships(
    objectName: string,
    records: Record<string, any>[],
    relationshipConfig: RelationshipConfig[],
    visitedIds: Set<string> = new Set()
  ): Promise<RecordWithRelationships[]> {
    const result: RecordWithRelationships[] = [];
    const description = await this.getObjectDescription(objectName);
    
    // Get included relationships
    const includedRelationships = relationshipConfig.filter(r => r.include);

    for (const record of records) {
      const recordId = record.Id;
      
      // Skip if already visited (prevent circular references)
      if (visitedIds.has(recordId)) {
        continue;
      }
      visitedIds.add(recordId);

      const recordWithRels: RecordWithRelationships = {
        objectName,
        record: { ...record },
        relationships: [],
      };

      // For each included relationship, find the related record
      for (const relConfig of includedRelationships) {
        const fieldValue = record[relConfig.fieldName];
        if (!fieldValue) continue;

        // Query the related record
        try {
          const relatedDescription = await this.getObjectDescription(relConfig.referenceTo);
          const relatedFields = relatedDescription.fields
            .filter((f: any) => f.createable || f.name === 'Id')
            .map((f: any) => f.name)
            .join(', ');

          const relatedQuery = `SELECT ${relatedFields} FROM ${relConfig.referenceTo} WHERE Id = '${fieldValue}'`;
          const relatedResult = await this.sourceConnection.query(relatedQuery);

          if (relatedResult.records.length > 0) {
            // Recursively analyze the related record's relationships
            const nestedConfig = await this.getDefaultRelationshipConfig(relConfig.referenceTo);
            const relatedRecordsWithRels = await this.analyzeRelationships(
              relConfig.referenceTo,
              relatedResult.records as Record<string, any>[],
              nestedConfig,
              visitedIds
            );

            recordWithRels.relationships.push({
              fieldName: relConfig.fieldName,
              relatedRecords: relatedRecordsWithRels,
            });
          }
        } catch (err) {
          console.error(`Error fetching related record for ${relConfig.fieldName}:`, err);
        }
      }

      result.push(recordWithRels);
    }

    return result;
  }

  /**
   * Get the default relationship configuration for an object
   * Excludes user/owner fields and system objects by default
   */
  async getDefaultRelationshipConfig(objectName: string): Promise<RelationshipConfig[]> {
    const relationships = await this.getRelationships(objectName);
    
    return relationships
      .filter(rel => rel.isCreateable) // Only include createable fields
      .map(rel => ({
        fieldName: rel.fieldName,
        include: !DEFAULT_EXCLUDED_FIELDS.includes(rel.fieldName) &&
                 !rel.referenceTo.some(obj => DEFAULT_EXCLUDED_OBJECTS.includes(obj)),
        referenceTo: rel.referenceTo[0], // Default to first reference object
      }));
  }

  /**
   * Build a migration plan from analyzed records
   * Determines insertion order and prepares records for target org
   */
  buildMigrationPlan(
    recordsWithRelationships: RecordWithRelationships[],
    excludedFields: string[] = DEFAULT_EXCLUDED_FIELDS
  ): MigrationPlan {
    const objectOrder: string[] = [];
    const recordsByObject = new Map<string, Record<string, any>[]>();
    const idMapping = new Map<string, string>();
    const relationshipRemapping: MigrationPlan['relationshipRemapping'] = [];
    const processedIds = new Set<string>();

    // Recursive function to process records in dependency order
    const processRecord = (recordWithRels: RecordWithRelationships) => {
      const { objectName, record, relationships } = recordWithRels;
      
      if (processedIds.has(record.Id)) {
        return;
      }

      // First, process all related records (they need to be inserted first)
      for (const rel of relationships) {
        for (const relatedRecord of rel.relatedRecords) {
          processRecord(relatedRecord);
        }
      }

      // Now process this record
      processedIds.add(record.Id);

      // Skip RecordType objects - they are mapped by DeveloperName, not inserted
      if (objectName === 'RecordType') {
        return;
      }

      // Add object to order if not already there
      if (!objectOrder.includes(objectName)) {
        objectOrder.push(objectName);
      }

      // Prepare record for insertion (remove non-createable/system fields)
      const cleanedRecord: Record<string, any> = {};
      const originalId = record.Id;

      for (const [key, value] of Object.entries(record)) {
        // Skip excluded fields, Id, and attributes
        if (
          key === 'Id' ||
          key === 'attributes' ||
          excludedFields.includes(key) ||
          key.endsWith('__r') // Skip relationship objects
        ) {
          continue;
        }
        cleanedRecord[key] = value;
      }

      // Store original ID for mapping
      cleanedRecord._originalId = originalId;

      // Track relationship fields that need remapping
      for (const rel of relationships) {
        if (rel.relatedRecords.length > 0) {
          const currentRecords = recordsByObject.get(objectName) || [];
          relationshipRemapping.push({
            objectName,
            fieldName: rel.fieldName,
            originalId: record[rel.fieldName],
            recordIndex: currentRecords.length,
          });
        }
      }

      // Add to records map
      if (!recordsByObject.has(objectName)) {
        recordsByObject.set(objectName, []);
      }
      recordsByObject.get(objectName)!.push(cleanedRecord);
    };

    // Process all records
    for (const recordWithRels of recordsWithRelationships) {
      processRecord(recordWithRels);
    }

    // Calculate statistics
    let totalRecords = 0;
    const objectCounts: Record<string, number> = {};
    for (const [objName, records] of recordsByObject) {
      objectCounts[objName] = records.length;
      totalRecords += records.length;
    }

    return {
      objectOrder,
      recordsByObject,
      idMapping,
      relationshipRemapping,
      totalRecords,
      objectCounts,
    };
  }

  /**
   * Get fields that are createable for an object
   */
  async getCreateableFields(objectName: string): Promise<string[]> {
    const description = await this.getObjectDescription(objectName);
    return description.fields
      .filter((f: any) => f.createable)
      .map((f: any) => f.name);
  }

  /**
   * Prepare a record for insertion by keeping only createable fields
   */
  async prepareRecordForInsert(
    objectName: string,
    record: Record<string, any>,
    excludedFields: string[] = []
  ): Promise<Record<string, any>> {
    const createableFields = await this.getCreateableFields(objectName);
    const prepared: Record<string, any> = {};

    for (const fieldName of createableFields) {
      if (
        record.hasOwnProperty(fieldName) &&
        !excludedFields.includes(fieldName) &&
        record[fieldName] !== undefined
      ) {
        prepared[fieldName] = record[fieldName];
      }
    }

    return prepared;
  }

  /**
   * Get child relationships for an object (for when user wants to include children)
   */
  async getChildRelationships(objectName: string): Promise<{
    childSObject: string;
    field: string;
    relationshipName: string;
  }[]> {
    const description = await this.getObjectDescription(objectName);
    
    return (description.childRelationships || [])
      .filter((rel: any) => rel.childSObject && rel.field && rel.relationshipName)
      .map((rel: any) => ({
        childSObject: rel.childSObject,
        field: rel.field,
        relationshipName: rel.relationshipName,
      }));
  }
}
