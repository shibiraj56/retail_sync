import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../../config/firebase';
import { requirePermission } from '../../middleware/auth';
import { logAuditEvent } from '../../middleware/audit';
import { CreateStoreSchema } from '../../shared/schemas';
import { ConflictError, handleFunctionError } from '../../shared/errors';
import type { StoreDocument } from '../../shared/types';

export async function createStoreHandler(request: CallableRequest): Promise<{
  storeId: string;
  storeCode: string;
}> {
  try {
    const input = CreateStoreSchema.parse(request.data);

    // Require 'stores:manage' permission on the organization
    const { user, membership } = await requirePermission(
      request,
      input.organizationId,
      'stores:manage'
    );

    const storesColl = db
      .collection('organizations')
      .doc(input.organizationId)
      .collection('stores');

    // Verify store code uniqueness within the organization
    const existingStoreSnap = await storesColl
      .where('storeCode', '==', input.storeCode)
      .limit(1)
      .get();

    if (!existingStoreSnap.empty) {
      throw new ConflictError(
        `Store code '${input.storeCode}' already exists in this organization`
      );
    }

    const storeRef = storesColl.doc();
    const storeId = storeRef.id;
    const now = admin.firestore.Timestamp.now();

    const storeDoc: StoreDocument = {
      id: storeId,
      organizationId: input.organizationId,
      storeCode: input.storeCode,
      name: input.name,
      address: input.address,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      timezone: input.timezone,
      isPrimary: false,
      status: 'ACTIVE',
      invoiceSettings: {
        prefix: input.invoicePrefix || `RS/${input.storeCode}/2026-27/`,
        taxInvoiceTitle: 'Tax Invoice',
      },
      createdAt: now,
      updatedAt: now,
    };

    await storeRef.set(storeDoc);

    // Audit log entry
    await logAuditEvent({
      organizationId: input.organizationId,
      action: 'STORE_CREATED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: membership.role,
      },
      targetEntity: {
        collection: 'stores',
        id: storeId,
      },
      details: {
        storeCode: input.storeCode,
        name: input.name,
      },
    });

    return {
      storeId,
      storeCode: input.storeCode,
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}
