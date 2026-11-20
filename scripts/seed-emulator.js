/**
 * Safe Demo Seed Data for Retail Sync Local Development Emulators ONLY.
 * NEVER execute against production databases.
 */

import { createRequire } from 'module';
import path from 'path';

// Verify that emulator environment is set
if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: seed-emulator.js must never be run in production environments.');
  process.exit(1);
}

// In emulator mode, point to local Firestore & Auth emulators
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const require = createRequire(path.resolve('functions/package.json'));
const admin = require('firebase-admin');

async function seed() {
  console.info('🌱 Seeding demo data into Firebase Local Emulators...');

  try {
    const app = admin.initializeApp({ projectId: 'demo-retail-sync' });
    const db = admin.firestore(app);
    const auth = admin.auth(app);

    const now = admin.firestore.Timestamp.now();

    // 1. Create Demo Users in Auth Emulator
    console.info('  -> Creating demo auth accounts...');
    const usersToCreate = [
      {
        uid: 'demo_user_owner',
        email: 'owner@retailsync.demo',
        password: 'Password@123',
        displayName: 'Rajesh Sharma (Owner)',
      },
      {
        uid: 'demo_user_manager',
        email: 'manager@retailsync.demo',
        password: 'Password@123',
        displayName: 'Priya Sundaram (Manager)',
      },
      {
        uid: 'demo_user_cashier',
        email: 'cashier@retailsync.demo',
        password: 'Password@123',
        displayName: 'Amit Patel (Cashier)',
      },
    ];

    for (const u of usersToCreate) {
      try {
        await auth.createUser(u);
      } catch (err) {
        console.info(`     User ${u.email} already present`);
      }
    }

    // 2. Create Demo Organization
    console.info('  -> Seeding demo organization...');
    const orgId = 'demo_org_apex';
    const orgRef = db.collection('organizations').doc(orgId);
    await orgRef.set({
      id: orgId,
      organizationName: 'Apex Retail Stores',
      legalName: 'Apex Retail Enterprises Private Limited',
      businessType: 'GROCERY',
      email: 'contact@apexretail.demo',
      phone: '+91 9876543210',
      address: {
        street: '100 Feet Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'India',
      },
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      fiscalYearSettings: {
        type: 'APRIL_TO_MARCH',
        isLocked: false,
      },
      heldBillSettings: {
        expirationHours: 24,
      },
      featuresEnabled: {
        batchExpiryTracking: true,
        serialNumberTracking: false,
        dualUnitOfMeasurement: true,
        customerKhataLedger: true,
        matrixVariants: false,
        loyaltyPoints: true,
      },
      ownerUserId: 'demo_user_owner',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // 3. Create Store Branches
    console.info('  -> Seeding demo store branches...');
    const mainStoreRef = orgRef.collection('stores').doc('store_apex_main');
    await mainStoreRef.set({
      id: 'store_apex_main',
      organizationId: orgId,
      storeCode: 'MAIN01',
      name: 'Apex Supermarket - Indiranagar',
      address: {
        street: '100 Feet Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'India',
      },
      contactPhone: '+91 9876543210',
      contactEmail: 'indiranagar@apexretail.demo',
      timezone: 'Asia/Kolkata',
      isPrimary: true,
      status: 'ACTIVE',
      invoiceSettings: {
        prefix: 'RS/MAIN01/2026-27/',
        taxInvoiceTitle: 'Tax Invoice',
        headerText: 'Apex Supermarket',
        footerText: 'Thank you for shopping at Apex!',
      },
      createdAt: now,
      updatedAt: now,
    });

    const korStoreRef = orgRef.collection('stores').doc('store_apex_kor');
    await korStoreRef.set({
      id: 'store_apex_kor',
      organizationId: orgId,
      storeCode: 'KOR02',
      name: 'Apex Express - Koramangala',
      address: {
        street: '80 Feet Road, 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560034',
        country: 'India',
      },
      contactPhone: '+91 9876543211',
      contactEmail: 'koramangala@apexretail.demo',
      timezone: 'Asia/Kolkata',
      isPrimary: false,
      status: 'ACTIVE',
      invoiceSettings: {
        prefix: 'RS/KOR02/2026-27/',
        taxInvoiceTitle: 'Tax Invoice',
        headerText: 'Apex Express',
        footerText: 'Thank you for shopping at Apex!',
      },
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create User Profiles & Authoritative Memberships
    console.info('  -> Seeding memberships and profiles...');
    const userProfiles = [
      {
        uid: 'demo_user_owner',
        email: 'owner@retailsync.demo',
        displayName: 'Rajesh Sharma',
        role: 'OWNER',
        assignedStores: [],
      },
      {
        uid: 'demo_user_manager',
        email: 'manager@retailsync.demo',
        displayName: 'Priya Sundaram',
        role: 'MANAGER',
        assignedStores: ['store_apex_main', 'store_apex_kor'],
      },
      {
        uid: 'demo_user_cashier',
        email: 'cashier@retailsync.demo',
        displayName: 'Amit Patel',
        role: 'CASHIER',
        assignedStores: ['store_apex_main'],
      },
    ];

    for (const p of userProfiles) {
      await db.collection('users').doc(p.uid).set({
        id: p.uid,
        email: p.email,
        displayName: p.displayName,
        isActive: true,
        defaultOrganizationId: orgId,
        createdAt: now,
        updatedAt: now,
      });

      const membershipId = `${p.uid}_${orgId}`;
      await db.collection('userMemberships').doc(membershipId).set({
        id: membershipId,
        userId: p.uid,
        userEmail: p.email,
        organizationId: orgId,
        role: p.role,
        assignedStoreIds: p.assignedStores,
        permissions: [],
        status: 'ACTIVE',
        invitedBy: 'demo_user_owner',
        createdAt: now,
        updatedAt: now,
      });
    }

    console.info('✅ Emulator seed completed successfully!');
    console.info('Demo Credentials:');
    console.info('  - Owner:   owner@retailsync.demo   / Password@123');
    console.info('  - Manager: manager@retailsync.demo / Password@123');
    console.info('  - Cashier: cashier@retailsync.demo / Password@123');
  } catch (error) {
    console.error('❌ Failed to seed emulator data:', error);
  }
}

seed();
