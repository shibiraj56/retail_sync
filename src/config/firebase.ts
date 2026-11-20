import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoDummyApiKeyForEmulators',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-retail-sync.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-retail-sync',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-retail-sync.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-south1');
export const storage = getStorage(app);

// Connect to Local Firebase Emulators when configured
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (useEmulators && typeof window !== 'undefined') {
  const host = window.location.hostname || '127.0.0.1';

  try {
    // Connect Auth Emulator
    const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || `http://${host}:9099`;
    connectAuthEmulator(auth, authHost, { disableWarnings: true });

    // Connect Firestore Emulator
    const firestorePort = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT) || 8080;
    connectFirestoreEmulator(db, host, firestorePort);

    // Connect Cloud Functions Emulator
    const functionsPort = 5001;
    connectFunctionsEmulator(functions, host, functionsPort);

    // Connect Storage Emulator
    const storagePort = Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT) || 9199;
    connectStorageEmulator(storage, host, storagePort);

    console.info('[Firebase] Connected to local Firebase Emulators');
  } catch (err) {
    console.warn('[Firebase] Emulators already connected or failed to initialize:', err);
  }
}
