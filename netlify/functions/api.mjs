import { OAuth2Client } from 'google-auth-library';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHandler } from '../../server/api.mjs';
const google = new OAuth2Client();
export default createHandler({
  env:process.env,
  verifyGoogle: async (idToken,audience) => (await google.verifyIdToken({idToken,audience})).getPayload(),
  getDatabase: () => {
    if(!getApps().length) initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}'))});
    return getFirestore();
  },
});
