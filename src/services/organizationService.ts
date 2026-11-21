import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, auth, functions } from '../config/firebase';
import type {
  Organization,
  Store,
  UserMembership,
  BusinessType,
  FiscalYearType,
  UserRole,
} from '../types';

export interface ProvisionOrgParams {
  organizationName: string;
  legalName: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  currency?: string;
  timezone?: string;
  fiscalYearType?: FiscalYearType;
  heldBillExpirationHours?: number;
  primaryStoreName?: string;
  primaryStoreCode?: string;
}

export interface CreateStoreParams {
  organizationId: string;
  storeCode: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactPhone: string;
  contactEmail?: string;
  timezone?: string;
  invoicePrefix?: string;
}

export interface InviteMemberParams {
  organizationId: string;
  email: string;
  role: 'MANAGER' | 'CASHIER' | 'INVENTORY_MANAGER' | 'ACCOUNTANT';
  assignedStoreIds?: string[];
}

export interface UpdateMembershipParams {
  organizationId: string;
  membershipId: string;
  role?: UserRole;
  assignedStoreIds?: string[];
  status?: 'ACTIVE' | 'SUSPENDED';
}

export const organizationService = {
  /**
   * Provision a new organization and default store via trusted Cloud Function
   */
  async provisionOrganization(params: ProvisionOrgParams): Promise<{
    organizationId: string;
    storeId: string;
    membershipId: string;
  }> {
    // 1. Verify user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Authentication token is required. Please sign in to continue.');
    }

    // 2. Obtain / refresh the current user's ID token to ensure active auth context
    try {
      await currentUser.getIdToken(true);
    } catch {
      throw new Error('Authentication session expired. Please sign in again.');
    }

    const callable = httpsCallable<ProvisionOrgParams, {
      organizationId: string;
      storeId: string;
      membershipId: string;
    }>(functions, 'provisionOrganization');

    const result = await callable(params);

    // 3. Force refresh token so updated custom claims (orgId, role) are active locally
    try {
      await currentUser.getIdToken(true);
    } catch {
      // Non-critical if claims refresh is delayed
    }

    return result.data;
  },

  /**
   * Query all memberships belonging to a user
   */
  async getUserMemberships(userId: string): Promise<UserMembership[]> {
    const q = query(
      collection(db, 'userMemberships'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserMembership);
  },

  /**
   * Fetch organization document by ID
   */
  async getOrganization(orgId: string): Promise<Organization | null> {
    const ref = doc(db, 'organizations', orgId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as Organization;
  },

  /**
   * Fetch all stores under an organization
   */
  async getStores(orgId: string): Promise<Store[]> {
    const storesColl = collection(db, 'organizations', orgId, 'stores');
    const snap = await getDocs(storesColl);
    return snap.docs.map((d) => d.data() as Store);
  },

  /**
   * Create a new store branch via trusted Cloud Function
   */
  async createStore(params: CreateStoreParams): Promise<{ storeId: string; storeCode: string }> {
    const callable = httpsCallable<CreateStoreParams, { storeId: string; storeCode: string }>(
      functions,
      'createStore'
    );
    const result = await callable(params);
    return result.data;
  },

  /**
   * Fetch all team memberships for an organization
   */
  async getOrganizationMembers(orgId: string): Promise<UserMembership[]> {
    const q = query(
      collection(db, 'userMemberships'),
      where('organizationId', '==', orgId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserMembership);
  },

  /**
   * Invite a new member via trusted Cloud Function
   */
  async inviteMember(params: InviteMemberParams): Promise<{
    membershipId: string;
    email: string;
    role: string;
    status: string;
  }> {
    const callable = httpsCallable<InviteMemberParams, {
      membershipId: string;
      email: string;
      role: string;
      status: string;
    }>(functions, 'inviteMember');
    const result = await callable(params);
    return result.data;
  },

  /**
   * Update membership role, status, or store assignments
   */
  async updateMembership(params: UpdateMembershipParams): Promise<{
    membershipId: string;
    role: string;
    status: string;
  }> {
    const callable = httpsCallable<UpdateMembershipParams, {
      membershipId: string;
      role: string;
      status: string;
    }>(functions, 'updateMembership');
    const result = await callable(params);
    return result.data;
  },
};
