import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus,
  Mail,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { useAuthStore } from '../../stores/authStore';
import { organizationService } from '../../services/organizationService';
import type { UserMembership, UserRole } from '../../types';

const InviteSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT']),
});

type InviteFormData = z.infer<typeof InviteSchema>;

export const TeamMembersPage: React.FC = () => {
  const { activeOrganization, activeMembership, stores } = useAuthStore();
  const [members, setMembers] = useState<UserMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const canManageTeam =
    activeMembership?.role === 'OWNER' ||
    activeMembership?.permissions.includes('users:invite_and_manage');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(InviteSchema),
    defaultValues: {
      role: 'CASHIER',
    },
  });

  const loadMembers = useCallback(async () => {
    if (!activeOrganization) return;
    setIsLoading(true);
    try {
      const data = await organizationService.getOrganizationMembers(activeOrganization.id);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load team members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrganization]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const onInviteSubmit = async (data: InviteFormData) => {
    if (!activeOrganization) return;
    setServerError(null);

    try {
      await organizationService.inviteMember({
        organizationId: activeOrganization.id,
        email: data.email,
        role: data.role,
        assignedStoreIds: selectedStores,
      });

      setIsInviteModalOpen(false);
      reset();
      setSelectedStores([]);
      await loadMembers();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : 'Failed to invite member. Please try again.'
      );
    }
  };

  const handleStatusToggle = async (membership: UserMembership) => {
    if (!activeOrganization) return;
    const newStatus = membership.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await organizationService.updateMembership({
        organizationId: activeOrganization.id,
        membershipId: membership.id,
        status: newStatus,
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member status');
    }
    setActiveMenuId(null);
  };

  const handleRoleChange = async (membership: UserMembership, newRole: UserRole) => {
    if (!activeOrganization) return;
    try {
      await organizationService.updateMembership({
        organizationId: activeOrganization.id,
        membershipId: membership.id,
        role: newRole,
      });
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member role');
    }
    setActiveMenuId(null);
  };

  const toggleStoreSelection = (storeId: string) => {
    setSelectedStores((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    );
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'OWNER':
        return 'purple';
      case 'MANAGER':
        return 'brand';
      case 'CASHIER':
        return 'warning';
      case 'INVENTORY_MANAGER':
        return 'amber';
      case 'ACCOUNTANT':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Team & Access Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-based access permissions, branch assignments, and invitations
          </p>
        </div>

        {canManageTeam && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => setIsInviteModalOpen(true)}
          >
            Invite Team Member
          </Button>
        )}
      </div>

      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-3xs uppercase font-bold text-slate-400 tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Member Email</th>
                <th className="px-5 py-3.5">Assigned Role</th>
                <th className="px-5 py-3.5">Membership Status</th>
                <th className="px-5 py-3.5">Branch Assignments</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    Loading team members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    No team members found.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isSelf = m.userId === activeMembership?.userId;
                  const isOwner = m.role === 'OWNER';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                            {m.userEmail.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="truncate">{m.userEmail}</p>
                            {isSelf && (
                              <span className="text-3xs text-brand-600 font-semibold">
                                (You)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <Badge variant={getRoleBadgeVariant(m.role)} size="sm">
                          {m.role}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5">
                        <Badge
                          variant={
                            m.status === 'ACTIVE'
                              ? 'success'
                              : m.status === 'INVITED'
                              ? 'brand'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {m.status}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5 text-slate-500">
                        {isOwner || !m.assignedStoreIds || m.assignedStoreIds.length === 0 ? (
                          <span className="text-slate-400 italic">All Store Branches</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {m.assignedStoreIds.map((storeId) => {
                              const storeObj = stores.find((s) => s.id === storeId);
                              return (
                                <span
                                  key={storeId}
                                  className="px-1.5 py-0.5 bg-slate-100 rounded text-3xs font-mono text-slate-600"
                                >
                                  {storeObj ? storeObj.storeCode : storeId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right relative">
                        {canManageTeam && !isSelf && !isOwner && (
                          <div className="inline-block text-left">
                            <button
                              onClick={() =>
                                setActiveMenuId(activeMenuId === m.id ? null : m.id)
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {activeMenuId === m.id && (
                              <div className="absolute right-5 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-xs">
                                <div className="px-3 py-1 text-3xs font-bold text-slate-400 uppercase">
                                  Change Role
                                </div>
                                {(['MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT'] as UserRole[]).map(
                                  (r) => (
                                    <button
                                      key={r}
                                      onClick={() => handleRoleChange(m, r)}
                                      className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${
                                        m.role === r ? 'font-bold text-brand-600' : 'text-slate-700'
                                      }`}
                                    >
                                      Set as {r}
                                    </button>
                                  )
                                )}

                                <div className="my-1 border-t border-slate-100" />
                                <button
                                  onClick={() => handleStatusToggle(m)}
                                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 font-medium ${
                                    m.status === 'ACTIVE'
                                      ? 'text-rose-600'
                                      : 'text-emerald-600'
                                  }`}
                                >
                                  {m.status === 'ACTIVE' ? 'Suspend Access' : 'Reactivate Access'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Organization Member"
        description="Send an invitation link and grant role-based store access"
        maxWidth="md"
      >
        {serverError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onInviteSubmit)} className="space-y-4">
          <Input
            label="Member Email Address"
            type="email"
            placeholder="cashier@example.com"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email')}
          />

          <Select
            label="Assign Operational Role"
            options={[
              { value: 'CASHIER', label: 'Cashier (POS Checkout only)' },
              { value: 'MANAGER', label: 'Store Manager (Sales, inventory, team)' },
              { value: 'INVENTORY_MANAGER', label: 'Inventory Clerk (Stock & GRN)' },
              { value: 'ACCOUNTANT', label: 'Accountant (Read-only reports & financial logs)' },
            ]}
            error={errors.role?.message}
            {...register('role')}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Branch Access Restrictions
            </label>
            <p className="text-2xs text-slate-500 mb-2">
              Select specific stores this member is permitted to operate. If none selected, member has access to all branches.
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
              {stores.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedStores.includes(s.id)}
                    onChange={() => toggleStoreSelection(s.id)}
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    {s.name} <strong className="text-slate-400">({s.storeCode})</strong>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
