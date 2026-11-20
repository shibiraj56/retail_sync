import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type {
  UserProfile,
  UserMembership,
  Organization,
  Store,
} from '../types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  memberships: UserMembership[];
  activeMembership: UserMembership | null;
  activeOrganization: Organization | null;
  activeStore: Store | null;
  stores: Store[];
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setMemberships: (memberships: UserMembership[]) => void;
  setActiveOrganization: (org: Organization | null) => void;
  setActiveStore: (store: Store | null) => void;
  setStores: (stores: Store[]) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  memberships: [],
  activeMembership: null,
  activeOrganization: null,
  activeStore: null,
  stores: [],
  isLoading: true,
  isInitialized: false,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setMemberships: (memberships) => {
    set((state) => {
      // Find active membership matching current active organization if available
      const active = state.activeOrganization
        ? memberships.find((m) => m.organizationId === state.activeOrganization?.id) || memberships[0] || null
        : memberships[0] || null;
      return { memberships, activeMembership: active };
    });
  },
  setActiveOrganization: (org) => {
    set((state) => {
      const activeMember = org
        ? state.memberships.find((m) => m.organizationId === org.id) || null
        : null;
      return { activeOrganization: org, activeMembership: activeMember };
    });
  },
  setActiveStore: (store) => set({ activeStore: store }),
  setStores: (stores) => {
    set((state) => {
      // If no active store selected yet, default to primary or first store
      const primary = stores.find((s) => s.isPrimary) || stores[0] || null;
      return {
        stores,
        activeStore: state.activeStore ? (stores.find((s) => s.id === state.activeStore?.id) || primary) : primary,
      };
    });
  },
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: (isInitialized) => set({ isInitialized }),
  reset: () =>
    set({
      user: null,
      profile: null,
      memberships: [],
      activeMembership: null,
      activeOrganization: null,
      activeStore: null,
      stores: [],
      isLoading: false,
      isInitialized: true,
    }),
}));
