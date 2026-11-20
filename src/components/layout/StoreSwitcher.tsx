import React, { useState, useRef, useEffect } from 'react';
import { Store as StoreIcon, ChevronDown, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import type { Store } from '../../types';

export const StoreSwitcher: React.FC = () => {
  const { stores, activeStore, setActiveStore, activeMembership } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter stores assigned to the member (if not owner and specific stores are assigned)
  const allowedStores = stores.filter((store) => {
    if (!activeMembership) return false;
    if (activeMembership.role === 'OWNER') return true;
    if (!activeMembership.assignedStoreIds || activeMembership.assignedStoreIds.length === 0) return true;
    return activeMembership.assignedStoreIds.includes(store.id);
  });

  const handleSelectStore = (store: Store) => {
    setActiveStore(store);
    setIsOpen(false);
  };

  if (!activeStore && allowedStores.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition-colors text-xs"
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-6 h-6 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <StoreIcon className="w-3.5 h-3.5" />
          </div>
          <div className="truncate">
            <p className="font-semibold text-slate-900 truncate">
              {activeStore ? activeStore.name : 'Select Store'}
            </p>
            <p className="text-3xs text-slate-500 uppercase tracking-wider">
              {activeStore ? `CODE: ${activeStore.storeCode}` : 'No store'}
            </p>
          </div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1 max-h-56 overflow-y-auto">
          <div className="px-3 py-1.5 text-3xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Assigned Branches ({allowedStores.length})
          </div>
          {allowedStores.map((store) => {
            const isSelected = activeStore?.id === store.id;
            return (
              <button
                key={store.id}
                onClick={() => handleSelectStore(store)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                  isSelected
                    ? 'bg-brand-50 text-brand-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="truncate">
                  <p className="truncate">{store.name}</p>
                  <p className="text-3xs text-slate-400 uppercase">
                    {store.storeCode} {store.isPrimary && '• PRIMARY'}
                  </p>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
