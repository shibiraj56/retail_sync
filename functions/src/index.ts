import { onCall } from 'firebase-functions/v2/https';
import { provisionOrganizationHandler } from './modules/organizations/provisionOrg';
import { updateFiscalYearHandler, updateHeldBillSettingsHandler } from './modules/organizations/updateSettings';
import { createStoreHandler } from './modules/stores/createStore';
import { inviteMemberHandler } from './modules/memberships/inviteMember';
import { updateMembershipHandler } from './modules/memberships/updateMembership';
import { syncUserProfile } from './modules/auth/syncUser';
import { requireAuth } from './middleware/auth';
import { handleFunctionError } from './shared/errors';

// Standard deployment options:
// asia-south1 region (Mumbai) as per System Architecture specification
const functionOptions = {
  region: 'asia-south1',
  enforceAppCheck: false, // In development emulator mode App Check is permissive
};

/**
 * Sync user profile to Firestore /users/{userId} on auth sign-in / registration
 */
export const syncUser = onCall(functionOptions, async (request) => {
  try {
    const user = requireAuth(request);
    const displayName = (request.data?.displayName as string) || undefined;
    const phoneNumber = (request.data?.phoneNumber as string) || undefined;
    return await syncUserProfile(user.uid, user.email, displayName, phoneNumber);
  } catch (error) {
    return handleFunctionError(error);
  }
});

/**
 * Provision a new organization and primary store atomically
 */
export const provisionOrganization = onCall(functionOptions, provisionOrganizationHandler);

/**
 * Create a new store branch under an existing organization
 */
export const createStore = onCall(functionOptions, createStoreHandler);

/**
 * Invite a new member to an organization with designated role and store assignments
 */
export const inviteMember = onCall(functionOptions, inviteMemberHandler);

/**
 * Update an existing member's role, status (ACTIVE/SUSPENDED), or assigned stores
 */
export const updateMembership = onCall(functionOptions, updateMembershipHandler);

/**
 * Update organization fiscal year configuration (locked once invoices exist)
 */
export const updateFiscalYear = onCall(functionOptions, updateFiscalYearHandler);

/**
 * Update organization held bill expiration settings (1 to 72 hours)
 */
export const updateHeldBillSettings = onCall(functionOptions, updateHeldBillSettingsHandler);

// ============================================================================
// PHASE 2 MASTER DATA MANAGEMENT (PIM)
// ============================================================================

export {
  upsertCategory,
  archiveCategory,
} from './modules/catalog/categories';

export {
  upsertBrand,
  archiveBrand,
} from './modules/catalog/brands';

export {
  upsertUnitOfMeasure,
  seedDefaultUnitsOfMeasure,
  archiveUnitOfMeasure,
} from './modules/catalog/unitsOfMeasure';

export {
  upsertMasterProduct,
  archiveProduct,
  setProductStatus,
} from './modules/catalog/products';

export {
  generateVariantMatrix,
  saveProductVariantsSync,
  upsertSingleVariant,
  archiveVariant,
  validateIdentifier,
} from './modules/catalog/variants';

export {
  createVariantMatrixJob,
  acquireJobLease,
  processVariantMatrixJobChunk,
  getVariantMatrixJobStatus,
} from './modules/catalog/variantJobs';



