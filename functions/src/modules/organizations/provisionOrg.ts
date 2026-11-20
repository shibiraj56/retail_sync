import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db, auth } from '../../config/firebase';
import { requireAuth } from '../../middleware/auth';
import { logAuditEvent } from '../../middleware/audit';
import { ProvisionOrganizationSchema } from '../../shared/schemas';
import { ConflictError, handleFunctionError } from '../../shared/errors';
import type {
  OrganizationDocument,
  StoreDocument,
  UserMembershipDocument,
} from '../../shared/types';
import { ROLE_DEFAULT_PERMISSIONS } from '../../shared/types';

export async function provisionOrganizationHandler(request: CallableRequest): Promise<{
  organizationId: string;
  storeId: string;
  membershipId: string;
}> {
  try {
    const user = requireAuth(request);

    // Validate request payload
    const input = ProvisionOrganizationSchema.parse(request.data);

    // Duplicate Provisioning Prevention:
    // Check if user already owns an active organization with the same legal name
    const existingOrgSnap = await db
      .collection('organizations')
      .where('ownerUserId', '==', user.uid)
      .where('legalName', '==', input.legalName)
      .limit(1)
      .get();

    if (!existingOrgSnap.empty) {
      throw new ConflictError(
        `You have already provisioned an organization with the legal name '${input.legalName}'`
      );
    }

    const orgRef = db.collection('organizations').doc();
    const orgId = orgRef.id;

    const storeRef = orgRef.collection('stores').doc();
    const storeId = storeRef.id;

    const membershipId = `${user.uid}_${orgId}`;
    const membershipRef = db.collection('userMemberships').doc(membershipId);
    const userRef = db.collection('users').doc(user.uid);

    const now = admin.firestore.Timestamp.now();

    // Industry vertical feature presets
    const featuresEnabled = {
      batchExpiryTracking: input.businessType === 'GROCERY',
      serialNumberTracking: input.businessType === 'ELECTRICAL',
      dualUnitOfMeasurement: input.businessType === 'HARDWARE' || input.businessType === 'WHOLESALE',
      customerKhataLedger: true,
      matrixVariants: input.businessType === 'TEXTILE',
      loyaltyPoints: true,
    };

    const orgDoc: OrganizationDocument = {
      id: orgId,
      organizationName: input.organizationName,
      legalName: input.legalName,
      businessType: input.businessType,
      email: input.email,
      phone: input.phone,
      address: input.address,
      country: input.country,
      currency: input.currency,
      timezone: input.timezone,
      fiscalYearSettings: {
        type: input.fiscalYearType,
        isLocked: false,
      },
      heldBillSettings: {
        expirationHours: input.heldBillExpirationHours,
      },
      featuresEnabled,
      ownerUserId: user.uid,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    const storeCode = input.primaryStoreCode || 'MAIN01';
    const storeDoc: StoreDocument = {
      id: storeId,
      organizationId: orgId,
      storeCode,
      name: input.primaryStoreName || `${input.organizationName} - Main Store`,
      address: input.address,
      contactPhone: input.phone,
      contactEmail: input.email,
      timezone: input.timezone,
      isPrimary: true,
      status: 'ACTIVE',
      invoiceSettings: {
        prefix: `RS/${storeCode}/2026-27/`,
        taxInvoiceTitle: 'Tax Invoice',
        headerText: input.organizationName,
        footerText: 'Thank you for shopping with us!',
      },
      createdAt: now,
      updatedAt: now,
    };

    const membershipDoc: UserMembershipDocument = {
      id: membershipId,
      userId: user.uid,
      userEmail: user.email,
      organizationId: orgId,
      role: 'OWNER',
      assignedStoreIds: [], // Empty denotes access to all stores in org
      permissions: ROLE_DEFAULT_PERMISSIONS.OWNER,
      status: 'ACTIVE',
      invitedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    // Atomic execution of organization creation
    const batch = db.batch();
    batch.set(orgRef, orgDoc);
    batch.set(storeRef, storeDoc);
    batch.set(membershipRef, membershipDoc);
    batch.set(
      userRef,
      {
        defaultOrganizationId: orgId,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();

    // Set supplementary custom claims on user Auth token
    try {
      await auth.setCustomUserClaims(user.uid, {
        orgId,
        defaultStoreId: storeId,
        role: 'OWNER',
      });
    } catch (claimErr) {
      console.warn('Failed to set supplementary custom claims (non-critical):', claimErr);
    }

    // Audit log entry
    await logAuditEvent({
      organizationId: orgId,
      action: 'ORGANIZATION_PROVISIONED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: 'OWNER',
      },
      targetEntity: {
        collection: 'organizations',
        id: orgId,
      },
      details: {
        legalName: input.legalName,
        businessType: input.businessType,
        primaryStoreId: storeId,
      },
    });

    return {
      organizationId: orgId,
      storeId,
      membershipId,
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}
