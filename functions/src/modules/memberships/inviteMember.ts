import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db, auth } from '../../config/firebase';
import { requirePermission } from '../../middleware/auth';
import { logAuditEvent } from '../../middleware/audit';
import { InviteMemberSchema } from '../../shared/schemas';
import { ConflictError, ForbiddenError, handleFunctionError } from '../../shared/errors';
import type { UserMembershipDocument } from '../../shared/types';
import { ROLE_DEFAULT_PERMISSIONS } from '../../shared/types';

export async function inviteMemberHandler(request: CallableRequest): Promise<{
  membershipId: string;
  email: string;
  role: string;
  status: string;
}> {
  try {
    const input = InviteMemberSchema.parse(request.data);

    // Require 'users:invite_and_manage' permission
    const { user, membership } = await requirePermission(
      request,
      input.organizationId,
      'users:invite_and_manage'
    );

    // Lookup user in Firebase Auth or create placeholder
    let targetUid: string;
    try {
      const userRecord = await auth.getUserByEmail(input.email);
      targetUid = userRecord.uid;
    } catch {
      // User does not exist in Firebase Auth yet; create an invited placeholder user
      const placeholderUser = await auth.createUser({
        email: input.email,
        emailVerified: false,
        disabled: false,
      });
      targetUid = placeholderUser.uid;
    }

    // Security check: users cannot invite themselves
    if (targetUid === user.uid) {
      throw new ForbiddenError('Users cannot invite themselves to an organization');
    }

    const membershipId = `${targetUid}_${input.organizationId}`;
    const membershipRef = db.collection('userMemberships').doc(membershipId);
    const existingMembership = await membershipRef.get();

    if (existingMembership.exists) {
      const data = existingMembership.data() as UserMembershipDocument;
      if (data.status === 'ACTIVE') {
        throw new ConflictError(`User ${input.email} is already an active member of this organization`);
      }
    }

    const now = admin.firestore.Timestamp.now();
    const newMembership: UserMembershipDocument = {
      id: membershipId,
      userId: targetUid,
      userEmail: input.email,
      organizationId: input.organizationId,
      role: input.role,
      assignedStoreIds: input.assignedStoreIds,
      permissions: ROLE_DEFAULT_PERMISSIONS[input.role],
      status: 'INVITED',
      invitedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await membershipRef.set(newMembership);

    // Audit log
    await logAuditEvent({
      organizationId: input.organizationId,
      action: 'MEMBER_INVITED',
      actor: {
        userId: user.uid,
        email: user.email,
        role: membership.role,
      },
      targetEntity: {
        collection: 'userMemberships',
        id: membershipId,
      },
      details: {
        invitedEmail: input.email,
        role: input.role,
        assignedStoreIds: input.assignedStoreIds,
      },
    });

    return {
      membershipId,
      email: input.email,
      role: input.role,
      status: 'INVITED',
    };
  } catch (error) {
    return handleFunctionError(error);
  }
}
