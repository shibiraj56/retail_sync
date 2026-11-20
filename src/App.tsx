import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './modules/auth/LoginPage';
import { RegisterPage } from './modules/auth/RegisterPage';
import { ForgotPasswordPage } from './modules/auth/ForgotPasswordPage';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { OrganizationSetupPage } from './modules/organization/OrganizationSetupPage';
import { StoreSetupPage } from './modules/organization/StoreSetupPage';
import { TeamMembersPage } from './modules/organization/TeamMembersPage';
import { SettingsPage } from './modules/organization/SettingsPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { AppLayout } from './components/layout/AppLayout';

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
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
