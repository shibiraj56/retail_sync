import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { authService } from '../../services/authService';

const ForgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordFormData = z.infer<typeof ForgotPasswordSchema>;

export const ForgotPasswordPage: React.FC = () => {
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setErrorMsg(null);
    try {
      await authService.forgotPassword(data.email);
      setIsSent(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to send password reset email. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 text-white font-bold text-xl shadow-md mb-3">
            RS
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Retail Sync</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-medium">
            Account Recovery
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Reset Password</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your registered email and we will send you a reset link
            </p>
          </div>

          {isSent ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-semibold text-emerald-900">Reset Email Sent</h3>
              <p className="text-xs text-emerald-700">
                Please check your inbox for instructions to reset your password.
              </p>
              <div className="pt-2">
                <Link to="/login">
                  <Button variant="outline" size="sm" fullWidth>
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="user@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                {...register('email')}
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                isLoading={isSubmitting}
              >
                Send Reset Link
              </Button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
