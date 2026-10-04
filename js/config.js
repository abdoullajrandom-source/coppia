// Configurazione Firebase (questi valori sono pubblici per natura: la sicurezza
// è garantita dalle regole di Firestore, non dal segreto di queste chiavi).
// Aggiungendo ?anteprima all'indirizzo l'app gira con dati finti.
export const firebaseConfig = {
  apiKey: 'AIzaSyCjOFJ3jOsHDqcfsDZ4LdfZLaYfzvhceUc',
  authDomain: 'coppia-1da1a.firebaseapp.com',
  projectId: 'coppia-1da1a',
  storageBucket: 'coppia-1da1a.firebasestorage.app',
  messagingSenderId: '789458135654',
  appId: '1:789458135654:web:790aa1461cfafde4fd5ba7',
};

// Chiave pubblica "Web Push" (Firebase > Impostazioni progetto > Cloud Messaging > Certificati push web)
export const vapidKey = 'BNFp1Cc7DB1r5zcU9nnf3Cl9nd7mxl2J8iHvkhX0Dk9hZLPJlzvMMK35SMrDSmVce78mhA_Dwkb26Zq1WzsYaao';
