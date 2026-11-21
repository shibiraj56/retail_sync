import { initializeApp as initClientApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import { createRequire } from 'module';
import path from 'path';

// Load Firebase Admin from functions node_modules
const funcRequire = createRequire(path.resolve('functions/package.json'));
const admin = funcRequire('firebase-admin');
const { Timestamp } = funcRequire('firebase-admin/firestore');

// Set emulator host environment for Admin SDK
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const adminApp = admin.initializeApp({ projectId: 'demo-retail-sync' }, 'admin-auth-verifier');
const adminDb = admin.firestore(adminApp);
const adminAuth = admin.auth(adminApp);

// Configure Client SDK
const firebaseConfig = {
  apiKey: 'AIzaSyDemoDummyApiKeyForEmulators',
  authDomain: 'demo-retail-sync.firebaseapp.com',
  projectId: 'demo-retail-sync',
};

const clientApp = initClientApp(firebaseConfig, 'client-auth-verifier');
const clientAuth = getAuth(clientApp);
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });

const clientFunctions = getFunctions(clientApp, 'asia-south1');
connectFunctionsEmulator(clientFunctions, '127.0.0.1', 5001);

async function runVerification() {
  console.log('======================================================================');
  console.log('🔒 VERIFYING AUTHENTICATION TOKEN IN PROVISIONING WORKFLOW');
  console.log('======================================================================');

  const timestamp = Date.now();
  const testEmail = `auth_owner_${timestamp}@retailsync.demo`;
  const testPassword = 'Password@123';
  const orgName = `Auth Test Retail ${timestamp}`;
  const legalName = `Auth Test Retail Private Limited ${timestamp}`;

  // -------------------------------------------------------------------------
  // Step 1: Register a new test user
  // -------------------------------------------------------------------------
  console.log('\n[Step 1] Registering a new test user via Firebase Auth Client...');
  const userCred = await createUserWithEmailAndPassword(clientAuth, testEmail, testPassword);
  const uid = userCred.user.uid;
  console.log(`  ✔ User created: UID = ${uid}, Email = ${testEmail}`);

  // -------------------------------------------------------------------------
  // Step 2: Verify user appears in Auth Emulator
  // -------------------------------------------------------------------------
  console.log('\n[Step 2] Verifying user record in Auth Emulator via Admin SDK...');
  const adminUserRecord = await adminAuth.getUser(uid);
  console.log(`  ✔ Found in Auth Emulator: email = ${adminUserRecord.email}, emailVerified = ${adminUserRecord.emailVerified}`);
  if (adminUserRecord.uid !== uid) {
    throw new Error(`UID mismatch in Auth Emulator! Expected ${uid}, got ${adminUserRecord.uid}`);
  }

  // -------------------------------------------------------------------------
  // Step 3: Confirm the frontend has an authenticated user
  // -------------------------------------------------------------------------
  console.log('\n[Step 3] Confirming frontend client has an authenticated user...');
  const currentUser = clientAuth.currentUser;
  if (!currentUser) {
    throw new Error('Frontend clientAuth.currentUser is null!');
  }
  console.log(`  ✔ Authenticated User confirmed: UID = ${currentUser.uid}, Email = ${currentUser.email}`);

  // -------------------------------------------------------------------------
  // Step 4: Confirm a valid ID token is obtained
  // -------------------------------------------------------------------------
  console.log('\n[Step 4] Confirming a valid ID token is obtained from Firebase Auth...');
  const idToken = await currentUser.getIdToken(true);
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Failed to retrieve valid ID token from Firebase Auth!');
  }
  // Verify token decoding with Admin SDK
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  console.log(`  ✔ Valid ID Token obtained and verified by Admin SDK:`);
  console.log(`    - Issuer (iss): ${decodedToken.iss}`);
  console.log(`    - Audience (aud): ${decodedToken.aud}`);
  console.log(`    - Subject (sub/uid): ${decodedToken.sub}`);
  console.log(`    - Auth Time: ${new Date(decodedToken.auth_time * 1000).toISOString()}`);
  if (decodedToken.uid !== uid) {
    throw new Error(`Decoded token UID (${decodedToken.uid}) does not match user UID (${uid})!`);
  }

  // -------------------------------------------------------------------------
  // Step 5: Submit organization provisioning
  // -------------------------------------------------------------------------
  console.log('\n[Step 5] Submitting organization provisioning via httpsCallable...');
  const provisionOrgCallable = httpsCallable(clientFunctions, 'provisionOrganization');
  const payload = {
    organizationName: orgName,
    legalName: legalName,
    businessType: 'GROCERY',
    email: testEmail,
    phone: '+91 9876543210',
    address: {
      street: '100 Feet Road, Indiranagar',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560038',
      country: 'India',
    },
    country: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscalYearType: 'APRIL_TO_MARCH',
    heldBillExpirationHours: 24,
    primaryStoreName: `${orgName} - Main Store`,
    primaryStoreCode: 'MAIN01',
  };

  const startTime = Date.now();
  let provisionResult;
  try {
    const res = await provisionOrgCallable(payload);
    provisionResult = res.data;
    console.log(`  ✔ provisionOrganization succeeded in ${Date.now() - startTime}ms`);
    console.log('  Result:', JSON.stringify(provisionResult, null, 2));
  } catch (err) {
    console.error('  ❌ provisionOrganization failed:', err);
    throw err;
  }

  const { organizationId, storeId, membershipId, claimsSynced } = provisionResult;

  // -------------------------------------------------------------------------
  // Step 6: Verify organization, store, membership, user profile & reservation
  // -------------------------------------------------------------------------
  console.log('\n[Step 6] Verifying Firestore resources created by provisioning...');

  // 6a: Organization document
  const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
  if (!orgSnap.exists) throw new Error(`Organization doc ${organizationId} not found!`);
  const orgData = orgSnap.data();
  console.log(`  ✔ Organization Document:`);
  console.log(`    - ID: ${orgData.id}, Name: ${orgData.organizationName}`);
  console.log(`    - Owner User ID: ${orgData.ownerUserId} (matches: ${orgData.ownerUserId === uid})`);
  console.log(`    - Status: ${orgData.status}`);
  console.log(`    - CreatedAt is Timestamp: ${orgData.createdAt instanceof Timestamp}`);

  // 6b: Primary Store document
  const storeSnap = await adminDb.collection('organizations').doc(organizationId).collection('stores').doc(storeId).get();
  if (!storeSnap.exists) throw new Error(`Store doc ${storeId} not found!`);
  const storeData = storeSnap.data();
  console.log(`  ✔ Store Document:`);
  console.log(`    - ID: ${storeData.id}, Code: ${storeData.storeCode}, Primary: ${storeData.isPrimary}`);
  console.log(`    - Status: ${storeData.status}`);
  console.log(`    - CreatedAt is Timestamp: ${storeData.createdAt instanceof Timestamp}`);

  // 6c: OWNER Membership document
  const membershipSnap = await adminDb.collection('userMemberships').doc(membershipId).get();
  if (!membershipSnap.exists) throw new Error(`Membership doc ${membershipId} not found!`);
  const memberData = membershipSnap.data();
  console.log(`  ✔ OWNER Membership Document:`);
  console.log(`    - ID: ${memberData.id}, Role: ${memberData.role}, Status: ${memberData.status}`);
  console.log(`    - Permissions: ${memberData.permissions?.length} permissions`);
  console.log(`    - CreatedAt is Timestamp: ${memberData.createdAt instanceof Timestamp}`);
  if (memberData.role !== 'OWNER') throw new Error(`Expected role OWNER, got ${memberData.role}`);

  // 6d: User profile update
  const userSnap = await adminDb.collection('users').doc(uid).get();
  const userData = userSnap.data();
  console.log(`  ✔ User Document:`);
  console.log(`    - Default Organization ID: ${userData?.defaultOrganizationId} (matches: ${userData?.defaultOrganizationId === organizationId})`);

  // 6e: Organization reservation document
  const normalizedName = legalName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const reservationId = `${uid}_${normalizedName}`;
  const resSnap = await adminDb.collection('organizationReservations').doc(reservationId).get();
  if (!resSnap.exists) throw new Error(`Reservation doc ${reservationId} not found!`);
  console.log(`  ✔ Reservation Document: ID = ${reservationId}, OrgID = ${resSnap.data()?.organizationId}`);

  // 6f: Custom Claims on user record
  const updatedUserRecord = await adminAuth.getUser(uid);
  console.log(`  ✔ Custom Claims in Auth Record:`, updatedUserRecord.customClaims);
  if (updatedUserRecord.customClaims?.orgId !== organizationId) {
    throw new Error(`Custom claim orgId mismatch!`);
  }

  // -------------------------------------------------------------------------
  // Step 7: Test provisioning without authentication (must be rejected)
  // -------------------------------------------------------------------------
  console.log('\n[Step 7] Testing provisioning without authentication...');
  await signOut(clientAuth);
  console.log(`  ✔ Client signed out: currentUser = ${clientAuth.currentUser}`);

  let unauthRejected = false;
  try {
    await provisionOrgCallable({
      ...payload,
      legalName: `Unauthenticated Org ${Date.now()}`,
    });
  } catch (unauthErr) {
    unauthRejected = true;
    console.log(`  ✔ Unauthenticated request REJECTED with code "${unauthErr.code}": "${unauthErr.message}"`);
    if (!unauthErr.message.includes('Authentication token is required') && unauthErr.code !== 'functions/unauthenticated') {
      throw new Error(`Unexpected error message for unauthenticated request: ${unauthErr.message}`);
    }
  }

  if (!unauthRejected) {
    throw new Error('Unauthenticated request was NOT rejected! Security check failed.');
  }

  // -------------------------------------------------------------------------
  // Step 8: Test duplicate organization provisioning
  // -------------------------------------------------------------------------
  console.log('\n[Step 8] Testing duplicate organization provisioning prevention...');
  // Sign back in as the owner
  await signInWithEmailAndPassword(clientAuth, testEmail, testPassword);
  console.log(`  ✔ Signed back in as: ${clientAuth.currentUser?.email}`);

  let duplicateRejected = false;
  try {
    // Attempt with the EXACT same legalName as Step 5
    await provisionOrgCallable(payload);
  } catch (dupErr) {
    duplicateRejected = true;
    console.log(`  ✔ Duplicate provisioning REJECTED as expected: "${dupErr.message}"`);
  }

  if (!duplicateRejected) {
    throw new Error('Duplicate organization provisioning was NOT rejected! Idempotency failed.');
  }

  console.log('\n======================================================================');
  console.log('🎉 ALL 8 VERIFICATION STEPS COMPLETED SUCCESSFULLY WITH ZERO ERRORS');
  console.log('======================================================================\n');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n💥 FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
