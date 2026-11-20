import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../config/firebase';
import { UnauthorizedError, ForbiddenError } from '../shared/errors';
import type { UserMembershipDocument, UserRole, Permission } from '../shared/types';
import { ROLE_DEFAULT_PERMISSIONS } from '../shared/types';

export interface AuthenticatedUser {
  uid: string;
  email: string;
}

export function requireAuth(request: CallableRequest): AuthenticatedUser {
  if (!request.auth || !request.auth.uid) {
    throw new UnauthorizedError('Authentication token is required');
  }

  return {
    uid: request.auth.uid,
    email: request.auth.token.email || '',
  };
}

/**
 * Authoritatively fetch the user's membership in the target organization from Firestore.
 * Does NOT rely solely on client JWT claims.
 */
export async function getAuthoritativeMembership(
  userId: string,
  organizationId: string
): Promise<UserMembershipDocument> {
  const membershipId = `${userId}_${organizationId}`;
  const membershipDoc = await db.collection('userMemberships').doc(membershipId).get();

  if (!membershipDoc.exists) {
    throw new ForbiddenError('You are not a member of this organization');
  }

  const membership = membershipDoc.data() as UserMembershipDocument;

  if (membership.status !== 'ACTIVE') {
    throw new ForbiddenError(`Your membership is currently ${membership.status.toLowerCase()}`);
  }

  return membership;
}

/**
 * Validates that the caller is authenticated and holds an ACTIVE membership in the organization.
 */
export async function requireMembership(
  request: CallableRequest,
  organizationId: string
): Promise<{ user: AuthenticatedUser; membership: UserMembershipDocument }> {
  const user = requireAuth(request);
  const membership = await getAuthoritativeMembership(user.uid, organizationId);
  return { user, membership };
}

/**
 * Validates that the member holds one of the specified roles.
 */
export async function requireRole(
  request: CallableRequest,
  organizationId: string,
  allowedRoles: UserRole[]
): Promise<{ user: AuthenticatedUser; membership: UserMembershipDocument }> {
  const { user, membership } = await requireMembership(request, organizationId);

  if (!allowedRoles.includes(membership.role)) {
    throw new ForbiddenError(
      `Role '${membership.role}' does not have sufficient privileges. Required: ${allowedRoles.join(', ')}`
    );
  }

  return { user, membership };
}

/**
 * Validates that the member possesses the required granular permission.
 */
export async function requirePermission(
  request: CallableRequest,
  organizationId: string,
  permission: Permission
): Promise<{ user: AuthenticatedUser; membership: UserMembershipDocument }> {
  const { user, membership } = await requireMembership(request, organizationId);

  // Check explicit custom permissions first
  const hasExplicitPerm = membership.permissions && membership.permissions.includes(permission);
  
  // Check default role permissions
  const rolePerms = ROLE_DEFAULT_PERMISSIONS[membership.role] || [];
  const hasRolePerm = rolePerms.includes(permission);

  if (!hasExplicitPerm && !hasRolePerm) {
    throw new ForbiddenError(`Missing required permission: '${permission}'`);
  }

  return { user, membership };
}

/**
 * Asserts that the member has permission to operate on the specified store.
 */
export function assertStoreAccess(
  membership: UserMembershipDocument,
  storeId: string
): void {
  // Organization Owner has universal access across all stores
  if (membership.role === 'OWNER') {
    return;
  }

  // An empty assignedStoreIds array denotes organization-wide access for managers/accountants
  if (!membership.assignedStoreIds || membership.assignedStoreIds.length === 0) {
    return;
  }

  if (!membership.assignedStoreIds.includes(storeId)) {
    throw new ForbiddenError(`You do not have access to store ID '${storeId}'`);
  }
}
