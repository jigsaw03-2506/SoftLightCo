import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const configValues = Object.values(firebaseConfig)
const configuredCount = configValues.filter(Boolean).length

export const firebaseConfigError =
  configuredCount > 0 && configuredCount < configValues.length
    ? 'Firebase config is incomplete. Set all VITE_FIREBASE_* values.'
    : null

export const firestoreDb =
  configuredCount === configValues.length
    ? getFirestore(
        getApps().length > 0
          ? getApp()
          : initializeApp(firebaseConfig),
      )
    : null

const firebaseApp = firestoreDb ? getApp() : null

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
