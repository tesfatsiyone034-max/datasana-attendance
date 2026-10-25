import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBj-3hVPwRdb0jATNsmTDDhiZbHEs1KW80",
  authDomain: "school-attendance-4a743.firebaseapp.com",
  projectId: "school-attendance-4a743",
  storageBucket: "school-attendance-4a743.firebasestorage.app",
  messagingSenderId: "614750167303",
  appId: "1:614750167303:web:073c2cdb6c8970004365a2",
  measurementId: "G-7FKYXSE86V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
