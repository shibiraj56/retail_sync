import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';
import { organizationService } from '../../services/organizationService';

export const ProtectedRoute: React.FC = () => {
  const {
    user,
    isLoading,
    isInitialized,
    setUser,
    setProfile,
    setMemberships,
    activeOrganization,
    setActiveOrganization,
    setStores,
    setLoading,
    setInitialized,
    activeMembership,
  } = useAuthStore();

  const location = useLocation();

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // 1. Fetch user profile
          const profile = await authService.getUserProfile(firebaseUser.uid);
          setProfile(profile);

          // 2. Fetch user memberships
          const memberships = await organizationService.getUserMemberships(firebaseUser.uid);
          setMemberships(memberships);

          // 3. Load active organization & stores if available
          if (memberships.length > 0) {
            const defaultOrgId = profile?.defaultOrganizationId || memberships[0].organizationId;
            const org = await organizationService.getOrganization(defaultOrgId);
            setActiveOrganization(org);

            if (org) {
              const stores = await organizationService.getStores(org.id);
              setStores(stores);
            }
          }
        } catch (err) {
          console.error('Failed to load user organization context:', err);
        }
      }

      setLoading(false);
      setInitialized(true);
    });

    return () => unsubscribe();
  }, [setUser, setProfile, setMemberships, setActiveOrganization, setStores, setLoading, setInitialized]);

  if (isLoading || !isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
        <p className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
          Initializing Retail Sync Console...
        </p>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated but user does not belong to any organization yet
  if (!activeOrganization && location.pathname !== '/setup-organization') {
    return <Navigate to="/setup-organization" replace />;
  }

  // Check if member is suspended
  if (activeMembership && activeMembership.status === 'SUSPENDED') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-md">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Suspended</h2>
          <p className="text-xs text-slate-600 mt-2">
            Your membership in <strong>{activeOrganization?.organizationName}</strong> has been
            suspended by an administrator. Please contact your organization owner for assistance.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
