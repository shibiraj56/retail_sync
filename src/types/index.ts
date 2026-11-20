export type UserRole =
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTANT';

export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

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
  expirationHours: number;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface UserProfile {
  id: string;
  email: string;
  phoneNumber?: string;
  displayName: string;
  isActive: boolean;
  defaultOrganizationId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserMembership {
  id: string; // `${userId}_${organizationId}`
  userId: string;
  userEmail: string;
  organizationId: string;
  role: UserRole;
  assignedStoreIds: string[];
  permissions: string[];
  status: MembershipStatus;
  invitedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Organization {
  id: string;
  organizationName: string;
  legalName: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  address: Address;
  country: string;
  currency: string;
  timezone: string;
  fiscalYearSettings: FiscalYearSettings;
  heldBillSettings: HeldBillSettings;
  ownerUserId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Store {
  id: string;
  organizationId: string;
  storeCode: string;
  name: string;
  address: Address;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}
