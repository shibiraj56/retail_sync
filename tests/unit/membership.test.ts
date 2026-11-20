import { describe, it, expect } from 'vitest';
import {
  ROLE_DEFAULT_PERMISSIONS,
  type UserMembershipDocument,
} from '../../functions/src/shared/types';
import { assertStoreAccess } from '../../functions/src/middleware/auth';
import { InviteMemberSchema } from '../../functions/src/shared/schemas';

describe('Membership & RBAC Unit Tests', () => {
  it('should grant all core permissions to OWNER role', () => {
    const ownerPerms = ROLE_DEFAULT_PERMISSIONS.OWNER;
    expect(ownerPerms).toContain('org:manage_settings');
    expect(ownerPerms).toContain('org:modify_fiscal_year');
    expect(ownerPerms).toContain('stores:manage');
    expect(ownerPerms).toContain('users:invite_and_manage');
    expect(ownerPerms).toContain('sales:checkout');
    expect(ownerPerms).toContain('reports:financial_summary');
  });

  it('should restrict Cashier to POS and view permissions', () => {
    const cashierPerms = ROLE_DEFAULT_PERMISSIONS.CASHIER;
    expect(cashierPerms).toContain('sales:checkout');
    expect(cashierPerms).toContain('catalog:read');
    expect(cashierPerms).not.toContain('org:manage_settings');
    expect(cashierPerms).not.toContain('stores:manage');
    expect(cashierPerms).not.toContain('reports:financial_summary');
  });

  it('should allow OWNER unrestricted access to all stores', () => {
    const ownerMembership: UserMembershipDocument = {
      id: 'usr1_org1',
      userId: 'usr1',
      userEmail: 'owner@retail.com',
      organizationId: 'org1',
      role: 'OWNER',
      assignedStoreIds: [],
      permissions: ROLE_DEFAULT_PERMISSIONS.OWNER,
      status: 'ACTIVE',
      invitedBy: 'usr1',
      createdAt: {} as any,
      updatedAt: {} as any,
    };

    expect(() => assertStoreAccess(ownerMembership, 'store_random')).not.toThrow();
  });

  it('should allow access when a member has designated store in assignedStoreIds', () => {
    const managerMembership: UserMembershipDocument = {
      id: 'usr2_org1',
      userId: 'usr2',
      userEmail: 'mgr@retail.com',
      organizationId: 'org1',
      role: 'MANAGER',
      assignedStoreIds: ['store_blr_01', 'store_blr_02'],
      permissions: ROLE_DEFAULT_PERMISSIONS.MANAGER,
      status: 'ACTIVE',
      invitedBy: 'usr1',
      createdAt: {} as any,
      updatedAt: {} as any,
    };

    expect(() => assertStoreAccess(managerMembership, 'store_blr_01')).not.toThrow();
    expect(() => assertStoreAccess(managerMembership, 'store_blr_02')).not.toThrow();
  });

  it('should throw ForbiddenError when a member attempts to access an unassigned store', () => {
    const cashierMembership: UserMembershipDocument = {
      id: 'usr3_org1',
      userId: 'usr3',
      userEmail: 'cashier@retail.com',
      organizationId: 'org1',
      role: 'CASHIER',
      assignedStoreIds: ['store_blr_01'],
      permissions: ROLE_DEFAULT_PERMISSIONS.CASHIER,
      status: 'ACTIVE',
      invitedBy: 'usr1',
      createdAt: {} as any,
      updatedAt: {} as any,
    };

    expect(() => assertStoreAccess(cashierMembership, 'store_mum_99')).toThrow(
      "You do not have access to store ID 'store_mum_99'"
    );
  });

  it('should reject invitation attempts assigning the OWNER role', () => {
    const invitePayload = {
      organizationId: 'org1',
      email: 'newowner@retail.com',
      role: 'OWNER',
      assignedStoreIds: [],
    };
    const result = InviteMemberSchema.safeParse(invitePayload);
    expect(result.success).toBe(false);
  });

  it('should accept valid staff invitations for Manager, Cashier, Inventory Clerk', () => {
    const validRoles = ['MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT'];
    for (const role of validRoles) {
      const payload = {
        organizationId: 'org1',
        email: `staff_${role.toLowerCase()}@retail.com`,
        role,
        assignedStoreIds: ['store_01'],
      };
      const result = InviteMemberSchema.safeParse(payload);
      expect(result.success).toBe(true);
    }
  });
});
