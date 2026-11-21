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
  UpsertUomInputSchema,
  type UpsertUomInput,
} from '../../schemas/catalog';

export const SYSTEM_DEFAULT_UOMS = [
  {
    id: 'uom_pcs',
    name: 'Piece',
    symbol: 'PCS',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
  },
  {
    id: 'uom_kg',
    name: 'Kilogram',
    symbol: 'KG',
    type: 'WEIGHT',
    allowDecimals: true,
    decimalPrecision: 3,
    isSystemDefault: true,
  },
  {
    id: 'uom_gm',
    name: 'Gram',
    symbol: 'GM',
    type: 'WEIGHT',
    allowDecimals: true,
    decimalPrecision: 2,
    isSystemDefault: true,
  },
  {
    id: 'uom_mtr',
    name: 'Meter',
    symbol: 'MTR',
    type: 'LENGTH',
    allowDecimals: true,
    decimalPrecision: 2,
    isSystemDefault: true,
  },
  {
    id: 'uom_ltr',
    name: 'Liter',
    symbol: 'LTR',
    type: 'VOLUME',
    allowDecimals: true,
    decimalPrecision: 3,
    isSystemDefault: true,
  },
  {
    id: 'uom_box',
    name: 'Box',
    symbol: 'BOX',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
  },
  {
    id: 'uom_set',
    name: 'Set',
    symbol: 'SET',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
  },
];

export const upsertUnitOfMeasure = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertUomInput>) => {
    try {
      const parseResult = UpsertUomInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid UoM payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;

      // Authoritative RBAC assertion: Only OWNER or MANAGER can write catalog records
      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const normalizedSymbol = input.symbol.toUpperCase();
      const uomId = input.id || `uom_${normalizedSymbol.toLowerCase()}`;
      const uomRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('unitsOfMeasure')
        .doc(uomId);

      await db.runTransaction(async (transaction) => {
        // --- 1. ALL READS FIRST ---
        // Verify symbol uniqueness within organization (excluding current uomId)
        const symbolQuery = db
          .collection('organizations')
          .doc(organizationId)
          .collection('unitsOfMeasure')
          .where('symbol', '==', normalizedSymbol);
        const symbolSnap = await transaction.get(symbolQuery);

        for (const doc of symbolSnap.docs) {
          if (doc.id !== uomId) {
            throw new ConflictError(`Unit of Measure with symbol '${normalizedSymbol}' already exists in this organization`);
          }
        }

        const existingDoc = await transaction.get(uomRef);
        const isSystemDefault = existingDoc.exists ? (existingDoc.data()?.isSystemDefault || false) : false;

        // --- 2. ALL WRITES AFTER READS ---
        const now = firestore.Timestamp.now();

        const uomData = {
          id: uomId,
          organizationId,
          name: input.name,
          symbol: normalizedSymbol,
          type: input.type,
          allowDecimals: input.allowDecimals,
          decimalPrecision: input.allowDecimals ? input.decimalPrecision : 0,
          isSystemDefault,
          status: input.status,
          createdAt: existingDoc.exists ? (existingDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        };

        transaction.set(uomRef, uomData, { merge: true });
      });

      return {
        success: true,
        uomId,
        message: 'Unit of Measure saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

export const seedDefaultUnitsOfMeasure = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string }>) => {
    try {
      const { organizationId } = request.data || {};
      if (!organizationId) {
        throw new ValidationError('organizationId is required');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const uomCollectionRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('unitsOfMeasure');

      const batch = db.batch();
      const now = firestore.Timestamp.now();

      for (const defaultUom of SYSTEM_DEFAULT_UOMS) {
        const docRef = uomCollectionRef.doc(defaultUom.id);
        batch.set(
          docRef,
          {
            ...defaultUom,
            organizationId,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      await batch.commit();

      return {
        success: true,
        count: SYSTEM_DEFAULT_UOMS.length,
        message: `Successfully seeded ${SYSTEM_DEFAULT_UOMS.length} default units of measure`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

export const archiveUnitOfMeasure = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; uomId: string }>) => {
    try {
      const { organizationId, uomId } = request.data || {};
      if (!organizationId || !uomId) {
        throw new ValidationError('organizationId and uomId are required');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const uomRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('unitsOfMeasure')
        .doc(uomId);

      const uomDoc = await uomRef.get();
      if (!uomDoc.exists) {
        throw new NotFoundError('Unit of Measure not found');
      }

      const uomData = uomDoc.data();
      if (uomData?.isSystemDefault) {
        throw new ValidationError('Cannot archive a system default unit of measure');
      }

      await uomRef.update({
        status: 'ARCHIVED',
        updatedAt: firestore.Timestamp.now(),
      });

      return {
        success: true,
        uomId,
        message: 'Unit of Measure archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
