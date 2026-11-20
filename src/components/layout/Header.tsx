import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';

export const Header: React.FC = () => {
  const { user, profile, activeStore, reset } = useAuthStore();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  const handleLogout = async () => {
    try {
      await authService.logout();
      reset();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 select-none">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Retail Management Console
        </h2>
        {activeStore && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium border border-slate-200">
            Active: {activeStore.name} ({activeStore.storeCode})
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Language selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </div>

        {/* User profile info */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-semibold text-xs">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block text-left text-xs">
            <p className="font-semibold text-slate-800 truncate max-w-[140px]">
              {profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-3xs text-slate-400 truncate max-w-[140px]">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          title="Sign Out"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
