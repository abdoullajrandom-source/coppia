// Configurazione Firebase (questi valori sono pubblici per natura: la sicurezza
// è garantita dalle regole di Firestore, non dal segreto di queste chiavi).
// Finché restano i segnaposto, l'app gira in "modalità anteprima" con dati finti.
export const firebaseConfig = {
  apiKey: 'INSERISCI_API_KEY',
  authDomain: 'INSERISCI.firebaseapp.com',
  projectId: 'INSERISCI',
  storageBucket: 'INSERISCI.firebasestorage.app',
  messagingSenderId: 'INSERISCI',
  appId: 'INSERISCI',
};

// Chiave pubblica "Web Push" (Firebase > Impostazioni progetto > Cloud Messaging > Certificati push web)
export const vapidKey = 'INSERISCI_VAPID_KEY';
