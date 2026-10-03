import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
// Paste your Firebase console config here.
const app = initializeApp({
  apiKey: 'YOUR_KEY', authDomain: 'YOUR.firebaseapp.com', projectId: 'YOUR_ID',
  storageBucket: 'YOUR.appspot.com', messagingSenderId: '0', appId: 'YOUR_APP_ID',
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const ADMIN_EMAIL = 'admin@dmmx.com';
