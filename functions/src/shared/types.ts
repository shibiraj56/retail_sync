import type { firestore } from 'firebase-admin';

export type UserRole =
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTANT';

export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export type Permission =
  | 'org:manage_settings'
  | 'org:modify_fiscal_year'
  | 'stores:manage'
  | 'users:invite_and_manage'
  | 'catalog:read'
  | 'catalog:write'
  | 'sales:checkout'
  | 'sales:apply_manual_discount'
  | 'sales:issue_refund_or_reversal'
  | 'inventory:view_balances'
  | 'inventory:adjust_and_scrap'
  | 'inventory:receive_grn'
  | 'cash_drawer:open_close'
  | 'reports:financial_summary'
  | 'reports:tax_export';

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    'org:manage_settings',
    'org:modify_fiscal_year',
    'stores:manage',
    'users:invite_and_manage',
    'catalog:read',
    'catalog:write',
    'sales:checkout',
    'sales:apply_manual_discount',
    'sales:issue_refund_or_reversal',
    'inventory:view_balances',
    'inventory:adjust_and_scrap',
    'inventory:receive_grn',
    'cash_drawer:open_close',
    'reports:financial_summary',
    'reports:tax_export',
  ],
  MANAGER: [
    'stores:manage',
    'users:invite_and_manage',
    'catalog:read',
    'catalog:write',
    'sales:checkout',
    'sales:apply_manual_discount',
    'sales:issue_refund_or_reversal',
    'inventory:view_balances',
    'inventory:adjust_and_scrap',
    'inventory:receive_grn',
    'cash_drawer:open_close',
    'reports:financial_summary',
  ],
  CASHIER: [
    'catalog:read',
    'sales:checkout',
    'inventory:view_balances',
    'cash_drawer:open_close',
  ],
  INVENTORY_MANAGER: [
    'catalog:read',
    'catalog:write',
    'inventory:view_balances',
    'inventory:adjust_and_scrap',
    'inventory:receive_grn',
  ],
  ACCOUNTANT: [
    'catalog:read',
    'inventory:view_balances',
    'reports:financial_summary',
    'reports:tax_export',
  ],
};

export interface UserProfileDocument {
  id: string; // Firebase Auth UID
  email: string;
  phoneNumber?: string;
  displayName: string;
  isActive: boolean;
  defaultOrganizationId?: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface UserMembershipDocument {
  id: string; // `${userId}_${organizationId}`
  userId: string;
  userEmail: string;
  organizationId: string;
  role: UserRole;
  assignedStoreIds: string[]; // empty array denotes all stores
  permissions: Permission[];
  status: MembershipStatus;
  invitedBy: string;
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export type BusinessType =
  | 'GROCERY'
  | 'TEXTILE'
  | 'HARDWARE'
  | 'ELECTRICAL'
  | 'WHOLESALE'
  | 'GENERAL';

export type FiscalYearType = 'APRIL_TO_MARCH' | 'JANUARY_TO_DECEMBER';

export interface FiscalYearSettings {
  type: FiscalYearType;
  customStartMonth?: number;
  isLocked: boolean;
}

export interface HeldBillSettings {
  expirationHours: number; // 1 to 72, default: 24
}

export interface TaxSettings {
  regime: 'INDIA_GST' | 'GENERIC_VAT' | 'CUSTOM';
  taxIdentificationNumber?: string;
  defaultTaxRatePercent: number;
  pricesIncludeTax: boolean;
}

export interface OrganizationDocument {
  id: string;
  organizationName: string;
  legalName: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  country: string; // Default: 'India'
  currency: string; // Default: 'INR'
  timezone: string; // Default: 'Asia/Kolkata'
  fiscalYearSettings: FiscalYearSettings;
  heldBillSettings: HeldBillSettings;
  taxSettings?: TaxSettings;
  featuresEnabled: {
    batchExpiryTracking: boolean;
    serialNumberTracking: boolean;
    dualUnitOfMeasurement: boolean;
    customerKhataLedger: boolean;
    matrixVariants: boolean;
    loyaltyPoints: boolean;
  };
  ownerUserId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface StoreDocument {
  id: string;
  organizationId: string;
  storeCode: string; // e.g. "MUM01"
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactPhone: string;
  contactEmail?: string;
  timezone: string;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  invoiceSettings: {
    prefix: string;
    headerText?: string;
    footerText?: string;
    taxInvoiceTitle: string;
    termsAndConditions?: string;
  };
  createdAt: firestore.Timestamp;
  updatedAt: firestore.Timestamp;
}

export interface AuditLogDocument {
  id: string;
  organizationId: string;
  action: string;
  actor: {
    userId: string;
    email: string;
    role?: UserRole;
  };
  targetEntity: {
    collection: string;
    id: string;
  };
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: firestore.Timestamp;
}
