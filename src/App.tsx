import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Route-level Lazy Loading for optimized bundle splitting
const LoginPage = lazy(() =>
  import('./modules/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import('./modules/auth/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('./modules/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
const OrganizationSetupPage = lazy(() =>
  import('./modules/organization/OrganizationSetupPage').then((m) => ({
    default: m.OrganizationSetupPage,
  }))
);
const StoreSetupPage = lazy(() =>
  import('./modules/organization/StoreSetupPage').then((m) => ({ default: m.StoreSetupPage }))
);
const TeamMembersPage = lazy(() =>
  import('./modules/organization/TeamMembersPage').then((m) => ({ default: m.TeamMembersPage }))
);
const SettingsPage = lazy(() =>
  import('./modules/organization/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const DashboardPage = lazy(() =>
  import('./modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CategoryListPage = lazy(() =>
  import('./modules/catalog/CategoryListPage').then((m) => ({ default: m.CategoryListPage }))
);
const BrandListPage = lazy(() =>
  import('./modules/catalog/BrandListPage').then((m) => ({ default: m.BrandListPage }))
);
const UomListPage = lazy(() =>
  import('./modules/catalog/UomListPage').then((m) => ({ default: m.UomListPage }))
);

const PageLoadingFallback: React.FC = () => (
  <div className="flex h-64 items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/setup-organization" element={<OrganizationSetupPage />} />

              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/stores" element={<StoreSetupPage />} />
                <Route path="/team" element={<TeamMembersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Phase 2 Master Data Routes */}
                <Route path="/catalog/categories" element={<CategoryListPage />} />
                <Route path="/catalog/brands" element={<BrandListPage />} />
                <Route path="/catalog/uom" element={<UomListPage />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
