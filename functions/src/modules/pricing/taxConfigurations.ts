import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { firestore } from 'firebase-admin';
import { db } from '../../config/firebase';
import { requireRole } from '../../middleware/auth';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  handleFunctionError,
} from '../../shared/errors';
import {
  UpsertTaxConfigurationInputSchema,
  type UpsertTaxConfigurationInput,
} from '../../schemas/pricing';

const PRICING_ADMIN_ROLES = ['OWNER', 'MANAGER'] as const;

export const STANDARD_INDIA_GST_SLABS = [
  {
    code: 'GST_EXEMPT',
    name: 'GST Exempt (0%)',
    ratePercent: 0,
    components: [
      { name: 'CGST (0%)', ratePercent: 0, type: 'CGST' as const },
      { name: 'SGST (0%)', ratePercent: 0, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_0_25',
    name: 'GST 0.25% (Precious Stones)',
    ratePercent: 0.25,
    components: [
      { name: 'CGST (0.125%)', ratePercent: 0.125, type: 'CGST' as const },
      { name: 'SGST (0.125%)', ratePercent: 0.125, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_3',
    name: 'GST 3% (Gold & Silver Jewellery)',
    ratePercent: 3,
    components: [
      { name: 'CGST (1.5%)', ratePercent: 1.5, type: 'CGST' as const },
      { name: 'SGST (1.5%)', ratePercent: 1.5, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_5',
    name: 'GST 5% (Essential Commodities)',
    ratePercent: 5,
    components: [
      { name: 'CGST (2.5%)', ratePercent: 2.5, type: 'CGST' as const },
      { name: 'SGST (2.5%)', ratePercent: 2.5, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_12',
    name: 'GST 12% (Standard Lower)',
    ratePercent: 12,
    components: [
      { name: 'CGST (6%)', ratePercent: 6, type: 'CGST' as const },
      { name: 'SGST (6%)', ratePercent: 6, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_18',
    name: 'GST 18% (Standard General)',
    ratePercent: 18,
    components: [
      { name: 'CGST (9%)', ratePercent: 9, type: 'CGST' as const },
      { name: 'SGST (9%)', ratePercent: 9, type: 'SGST' as const },
    ],
  },
  {
    code: 'GST_28',
    name: 'GST 28% (Luxury & Demerit Goods)',
    ratePercent: 28,
    components: [
      { name: 'CGST (14%)', ratePercent: 14, type: 'CGST' as const },
      { name: 'SGST (14%)', ratePercent: 14, type: 'SGST' as const },
    ],
  },
];

/**
 * Creates or updates a tax configuration document inside an organization.
 */
export const upsertTaxConfiguration = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertTaxConfigurationInput>) => {
    try {
      const parseResult = UpsertTaxConfigurationInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid tax configuration: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;
      await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      const taxColRef = db.collection('organizations').doc(organizationId).collection('taxConfigurations');
      const normalizedCode = input.code.toUpperCase();
      const taxDocId = input.id || `tax_${normalizedCode.toLowerCase()}`;
      const taxDocRef = taxColRef.doc(taxDocId);

      const now = firestore.Timestamp.now();

      await db.runTransaction(async (transaction) => {
        // Read existing tax doc
        const existingDoc = await transaction.get(taxDocRef);
        if (existingDoc.exists) {
          const oldData = existingDoc.data();
          if (oldData?.status === 'ARCHIVED') {
            throw new ValidationError('Cannot modify an archived tax configuration');
          }
        }

        // Code uniqueness across active configurations
        const codeQuery = taxColRef.where('code', '==', normalizedCode).where('status', '==', 'ACTIVE');
        const codeQuerySnap = await transaction.get(codeQuery);
        for (const doc of codeQuerySnap.docs) {
          if (doc.id !== taxDocId) {
            throw new ConflictError(`Tax code '${normalizedCode}' is already registered to another active configuration`);
          }
        }

        // Default components if not provided
        let components = input.components;
        if (components.length === 0 && input.jurisdiction === 'INDIA_GST') {
          const halfRate = input.ratePercent / 2;
          components = [
            { name: `CGST (${halfRate}%)`, ratePercent: halfRate, type: 'CGST' },
            { name: `SGST (${halfRate}%)`, ratePercent: halfRate, type: 'SGST' },
          ];
        }

        const taxData = {
          id: taxDocId,
          organizationId,
          name: input.name,
          code: normalizedCode,
          ratePercent: input.ratePercent,
          components,
          effectiveStartDate: input.effectiveStartDate,
          effectiveEndDate: input.effectiveEndDate || null,
          jurisdiction: input.jurisdiction,
          status: input.status,
          isSystemDefault: existingDoc.exists ? (existingDoc.data()?.isSystemDefault || false) : false,
          updatedAt: now,
          createdAt: existingDoc.exists ? (existingDoc.data()?.createdAt || now) : now,
        };

        transaction.set(taxDocRef, taxData, { merge: true });
      });

      return {
        success: true,
        taxConfigurationId: taxDocId,
        message: 'Tax configuration saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Seeds standard India GST slabs into an organization.
 */
export const seedDefaultTaxConfigurations = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string }>) => {
    try {
      const { organizationId } = request.data || {};
      if (!organizationId) {
        throw new ValidationError('organizationId is required');
      }

      await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      const taxColRef = db.collection('organizations').doc(organizationId).collection('taxConfigurations');
      const now = firestore.Timestamp.now();
      const batch = db.batch();

      let seededCount = 0;
      for (const slab of STANDARD_INDIA_GST_SLABS) {
        const docId = `tax_${slab.code.toLowerCase()}`;
        const docRef = taxColRef.doc(docId);
        batch.set(
          docRef,
          {
            id: docId,
            organizationId,
            name: slab.name,
            code: slab.code,
            ratePercent: slab.ratePercent,
            components: slab.components,
            effectiveStartDate: '2026-04-01T00:00:00.000Z',
            effectiveEndDate: null,
            jurisdiction: 'INDIA_GST',
            status: 'ACTIVE',
            isSystemDefault: true,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        seededCount++;
      }

      await batch.commit();

      return {
        success: true,
        seededCount,
        message: `Successfully seeded ${seededCount} standard GST slabs`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Archives a tax configuration (cannot delete if referenced).
 */
export const archiveTaxConfiguration = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; taxConfigurationId: string }>) => {
    try {
      const { organizationId, taxConfigurationId } = request.data || {};
      if (!organizationId || !taxConfigurationId) {
        throw new ValidationError('organizationId and taxConfigurationId are required');
      }

      await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      const taxDocRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('taxConfigurations')
        .doc(taxConfigurationId);

      const taxDoc = await taxDocRef.get();
      if (!taxDoc.exists) {
        throw new NotFoundError(`Tax configuration '${taxConfigurationId}' not found`);
      }

      const now = firestore.Timestamp.now();
      await taxDocRef.update({
        status: 'ARCHIVED',
        updatedAt: now,
      });

      return {
        success: true,
        taxConfigurationId,
        message: 'Tax configuration archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
