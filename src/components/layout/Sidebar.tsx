import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  Users,
  Settings,
  Building2,
  FolderTree,
  Tag,
  Scale,
  Package,
  Receipt,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { StoreSwitcher } from './StoreSwitcher';
import { Badge } from '../common/Badge';

export const Sidebar: React.FC = () => {
  const { activeOrganization, activeMembership } = useAuthStore();

  const navLinks = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      end: true,
    },
    {
      to: '/stores',
      label: 'Store Branches',
      icon: <Store className="w-4 h-4" />,
    },
    {
      to: '/team',
      label: 'Team & Access',
      icon: <Users className="w-4 h-4" />,
    },
    {
      to: '/settings',
      label: 'Settings & Policy',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const catalogLinks = [
    {
      to: '/catalog/products',
      label: 'Products',
      icon: <Package className="w-4 h-4" />,
    },
    {
      to: '/catalog/categories',
      label: 'Categories',
      icon: <FolderTree className="w-4 h-4" />,
    },
    {
      to: '/catalog/brands',
      label: 'Brands',
      icon: <Tag className="w-4 h-4" />,
    },
    {
      to: '/catalog/uom',
      label: 'Units of Measure',
      icon: <Scale className="w-4 h-4" />,
    },
    {
      to: '/catalog/pricing',
      label: 'Pricing & Tax',
      icon: <Receipt className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs">
            RS
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight">
              Retail Sync
            </h1>
            <p className="text-3xs text-slate-400 font-medium tracking-wide uppercase">
              Cloud Retail ERP
            </p>
          </div>
        </div>
        <span className="text-3xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-medium">
          v0.1
        </span>
      </div>

      {/* Organization Card & Store Switcher */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/50">
        <div className="mb-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Organization
            </span>
            {activeMembership && (
              <Badge variant="purple" size="sm">
                {activeMembership.role}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <p className="text-xs font-semibold text-slate-900 truncate">
              {activeOrganization?.organizationName || 'Loading...'}
            </p>
          </div>
        </div>
        <StoreSwitcher />
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-2 py-1 text-3xs font-bold text-slate-400 uppercase tracking-wider">
          Core Management
        </div>
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <span className="text-slate-400 group-hover:text-slate-600">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}

        <div className="pt-3 px-2 py-1 text-3xs font-bold text-slate-400 uppercase tracking-wider">
          Master Data (PIM)
        </div>
        {catalogLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <span className="text-slate-400 group-hover:text-slate-600">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between text-3xs text-slate-400">
          <span>Region: asia-south1</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Cloud Online
          </span>
        </div>
      </div>
    </aside>
  );
};
