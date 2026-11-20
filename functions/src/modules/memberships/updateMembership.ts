import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../../config/firebase';
import { requirePermission } from '../../middleware/auth';
import { logAuditEvent } from '../../middleware/audit';
import { UpdateMembershipSchema } from '../../shared/schemas';
import { ForbiddenError, NotFoundError, handleFunctionError } from '../../shared/errors';
import type { UserMembershipDocument } from '../../shared/types';
import { ROLE_DEFAULT_PERMISSIONS } from '../../shared/types';

export async function updateMembershipHandler(request: CallableRequest): Promise<{
  membershipId: string;
  role: string;
  status: string;
}> {
  try {
    const input = UpdateMembershipSchema.parse(request.data);

    // Require 'users:invite_and_manage' permission
    const { user, membership } = await requirePermission(
      request,
      input.organizationId,
      'users:invite_and_manage'
    );

    const membershipRef = db.collection('userMemberships').doc(input.membershipId);
    const targetDoc = await membershipRef.get();

    if (!targetDoc.exists) {
      throw new NotFoundError('Membership record not found');
    }

    const targetMembership = targetDoc.data() as UserMembershipDocument;

    // Self-escalation / self-modification protection:
    // Users CANNOT modify their own membership permissions or roles
    if (targetMembership.userId === user.uid) {
      throw new ForbiddenError('You cannot modify your own membership role or permissions');
    }

    // Protection for OWNER accounts:
    // Only an OWNER can modify or suspend another membership; non-owners cannot touch OWNER accounts
    if (targetMembership.role === 'OWNER') {
      throw new ForbiddenError('Cannot modify the organization owner membership');
    }

    const now = admin.firestore.Timestamp.now();
    const updates: Partial<UserMembershipDocument> = {
      updatedAt: now,
    };

    if (input.role) {
      updates.role = input.role;
      updates.permissions = ROLE_DEFAULT_PERMISSIONS[input.role];
    }

    if (input.assignedStoreIds !== undefined) {
      updates.assignedStoreIds = input.assignedStoreIds;
    }

    if (input.status) {
      updates.status = input.status;
    }

    await membershipRef.update(updates);

    // Audit log
    await logAuditEvent({
      organizationId: input.organizationId,
      action: 'MEMBERSHIP_UPDATED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: membership.role,
      },
      targetEntity: {
        collection: 'userMemberships',
        id: input.membershipId,
      },
      details: {
        targetUserId: targetMembership.userId,
        targetEmail: targetMembership.userEmail,
        updatedFields: updates,
      },
    });

    return {
      membershipId: input.membershipId,
      role: updates.role || targetMembership.role,
      status: updates.status || targetMembership.status,
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}
