import { z } from 'zod';

export const BusinessTypeSchema = z.enum([
  'GROCERY',
  'TEXTILE',
  'HARDWARE',
  'ELECTRICAL',
  'WHOLESALE',
  'GENERAL',
]);

export const FiscalYearTypeSchema = z.enum([
  'APRIL_TO_MARCH',
  'JANUARY_TO_DECEMBER',
]);

export const AddressSchema = z.object({
  street: z.string().min(1, 'Street is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  country: z.string().min(1, 'Country is required').default('India'),
});

export const ProvisionOrganizationSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  legalName: z.string().min(2, 'Legal name must be at least 2 characters').max(100),
  businessType: BusinessTypeSchema,
  email: z.string().email('Invalid organization email address'),
  phone: z.string().min(5, 'Phone must be at least 5 characters').max(20),
  address: AddressSchema,
  country: z.string().default('India'),
  currency: z.string().default('INR'),
  timezone: z.string().default('Asia/Kolkata'),
  fiscalYearType: FiscalYearTypeSchema.default('APRIL_TO_MARCH'),
  heldBillExpirationHours: z.number().int().min(1).max(72).default(24),
  primaryStoreName: z.string().min(2).max(100).optional(),
  primaryStoreCode: z.string().min(2).max(10).regex(/^[A-Z0-9_-]+$/, 'Store code must be alphanumeric').optional(),
});

export const CreateStoreSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  storeCode: z.string().min(2, 'Store code must be at least 2 characters').max(10).regex(/^[A-Z0-9_-]+$/, 'Store code must be alphanumeric'),
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100),
  address: AddressSchema,
  contactPhone: z.string().min(5).max(20),
  contactEmail: z.string().email().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  invoicePrefix: z.string().max(20).optional(),
});

export const UserRoleSchema = z.enum([
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
]);

export const InviteMemberSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT'], {
    errorMap: () => ({ message: 'Cannot assign OWNER role via member invitation' }),
  }),
  assignedStoreIds: z.array(z.string()).default([]),
});

export const UpdateMembershipSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  membershipId: z.string().min(1, 'Membership ID is required'),
  role: z.enum(['MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT']).optional(),
  assignedStoreIds: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const UpdateFiscalYearSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  fiscalYearType: FiscalYearTypeSchema,
});

export const UpdateHeldBillSettingsSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  expirationHours: z.number().int().min(1).max(72),
});
