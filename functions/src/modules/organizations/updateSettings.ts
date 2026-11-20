import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../../config/firebase';
import { requireRole, requirePermission } from '../../middleware/auth';
import { logAuditEvent } from '../../middleware/audit';
import {
  UpdateFiscalYearSchema,
  UpdateHeldBillSettingsSchema,
} from '../../shared/schemas';
import { ForbiddenError, NotFoundError, handleFunctionError } from '../../shared/errors';
import type { OrganizationDocument } from '../../shared/types';

export async function updateFiscalYearHandler(request: CallableRequest): Promise<{
  organizationId: string;
  fiscalYearType: string;
}> {
  try {
    const input = UpdateFiscalYearSchema.parse(request.data);

    // Only OWNER can modify fiscal year configuration
    const { user } = await requireRole(request, input.organizationId, ['OWNER']);

    const orgRef = db.collection('organizations').doc(input.organizationId);
    const orgSnap = await orgRef.get();

    if (!orgSnap.exists) {
      throw new NotFoundError('Organization not found');
    }

    const orgData = orgSnap.data() as OrganizationDocument;

    // Phase 0 rule: If locked (invoices have been issued), reject standard updates
    if (orgData.fiscalYearSettings?.isLocked) {
      throw new ForbiddenError(
        'Fiscal year configuration is permanently locked because sales invoices have already been issued'
      );
    }

    const now = admin.firestore.Timestamp.now();
    await orgRef.update({
      'fiscalYearSettings.type': input.fiscalYearType,
      updatedAt: now,
    });

    await logAuditEvent({
      organizationId: input.organizationId,
      action: 'FISCAL_YEAR_UPDATED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: 'OWNER',
      },
      targetEntity: {
        collection: 'organizations',
        id: input.organizationId,
      },
      details: {
        previousType: orgData.fiscalYearSettings?.type,
        newType: input.fiscalYearType,
      },
    });

    return {
      organizationId: input.organizationId,
      fiscalYearType: input.fiscalYearType,
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}

export async function updateHeldBillSettingsHandler(request: CallableRequest): Promise<{
  organizationId: string;
  expirationHours: number;
}> {
  try {
    const input = UpdateHeldBillSettingsSchema.parse(request.data);

    // Require 'org:manage_settings' permission
    const { user, membership } = await requirePermission(
      request,
      input.organizationId,
      'org:manage_settings'
    );

    const orgRef = db.collection('organizations').doc(input.organizationId);
    const orgSnap = await orgRef.get();

    if (!orgSnap.exists) {
      throw new NotFoundError('Organization not found');
    }

    const now = admin.firestore.Timestamp.now();
    await orgRef.update({
      'heldBillSettings.expirationHours': input.expirationHours,
      updatedAt: now,
    });

    await logAuditEvent({
      organizationId: input.organizationId,
      action: 'HELD_BILL_SETTINGS_UPDATED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: membership.role,
      },
      targetEntity: {
        collection: 'organizations',
        id: input.organizationId,
      },
      details: {
        expirationHours: input.expirationHours,
      },
    });

    return {
      organizationId: input.organizationId,
      expirationHours: input.expirationHours,
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}
