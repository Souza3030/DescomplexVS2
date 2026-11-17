import { initializeApp } from 'firebase/app';
import publicConfig from './firebase-config.json';
// Only Firebase Cloud Messaging remains in the browser. Authentication and
// Firestore access go through the Google-verified server API.
export const app = initializeApp(publicConfig);
