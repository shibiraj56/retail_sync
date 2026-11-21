import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof LoginSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    try {
      const user = await authService.login(data.email, data.password);
      setUser(user);
      navigate('/');
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Invalid email or password. Please try again.';
      setAuthError(errorMsg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 text-white font-bold text-xl shadow-md mb-3">
            RS
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Retail Sync</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-medium">
            Cloud-Based Retail Management Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Sign In to Terminal</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter your operational credentials to continue</p>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="cashier@example.com"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              isLoading={isSubmitting}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-600">
              New business owner?{' '}
              <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
                Register an organization
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-3xs text-slate-400 font-mono">
          SECURED VIA FIREBASE CLOUD MONOLITH • ASIA-SOUTH1
        </div>
      </div>
    </div>
  );
};
