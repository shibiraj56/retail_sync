import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDemoDummyApiKeyForEmulators',
  authDomain: 'demo-retail-sync.firebaseapp.com',
  projectId: 'demo-retail-sync',
  storageBucket: 'demo-retail-sync.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const functions = getFunctions(app, 'asia-south1');
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

async function test() {
  const timestamp = Date.now();
  const email = `testowner_${timestamp}@example.com`;
  const password = 'Password@123';
  console.log('Creating user:', email);
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  console.log('User created:', userCred.user.uid);

  const provisionOrg = httpsCallable(functions, 'provisionOrganization');
  const payload = {
    organizationName: 'Test Retail Mart',
    legalName: `Test Retail Mart Pvt Ltd ${timestamp}`,
    businessType: 'GROCERY',
    email: email,
    phone: '+91 9876543210',
    address: {
      street: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    country: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscalYearType: 'APRIL_TO_MARCH',
    heldBillExpirationHours: 24,
    primaryStoreName: 'Test Retail Mart - Main',
    primaryStoreCode: 'MAIN01',
  };

  console.log('Calling provisionOrganization...');
  try {
    const res = await provisionOrg(payload);
    console.log('Success result:', res.data);
  } catch (err) {
    console.error('PROVISION ERROR CAUGHT:', err.message);
    if (err.details) console.error('Details:', err.details);
  }
}

test().catch(console.error);
