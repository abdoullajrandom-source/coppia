# Coppia 💞

Una piccola web app per Lay (Giappone) e Alma (Italia): si installa nella schermata Home del telefono.

- **Orari**: ognuno segna le ore in cui è occupato, l'app converte i fusi orari e mostra i momenti liberi in comune per i prossimi 7 giorni. Da lì si fissa una videochiamata.
- **Ti penso**: un tocco fa vibrare il telefono dell'altra persona. Non serve rispondere.
- **Pausa gentile**: "mi prendo un momento, ti scrivo alle 21".
- **Conto alla rovescia** al prossimo incontro.
- **Colore** personalizzabile per ognuno.

Niente "ultimo accesso", niente "letto alle", niente posizione.

## Com'è fatta

- `public/`: l'app (HTML, CSS e JavaScript senza passaggi di compilazione), pubblicata su GitHub Pages a ogni push su `main`.
- `public/js/config.js`: la configurazione Firebase. Con i segnaposto l'app gira in **anteprima** con dati finti (anche con `?anteprima` nell'indirizzo).
- `firestore.rules`: chi può leggere e scrivere cosa (solo i due membri della coppia).
- `functions/`: la funzione che invia le notifiche push quando arriva un "ti penso", una pausa o una chiamata.
- `public/vendor/firebase.js`: l'SDK Firebase impacchettato (`npm run vendor` per rigenerarlo).

## Messa in funzione (una volta sola)

1. **Progetto Firebase** su https://console.firebase.google.com (piano Blaze, necessario per le notifiche; con due persone il costo resta zero, conviene impostare un avviso di budget di 1 €).
2. **Authentication** → Metodo di accesso → attiva *Email/password*. In *Impostazioni → Domini autorizzati* aggiungi `abdoullajrandom-source.github.io`.
3. **Firestore Database** → Crea database in `europe-west1`.
4. **Impostazioni progetto → Generali** → aggiungi un'app Web e copia la configurazione in `public/js/config.js`.
5. **Impostazioni progetto → Cloud Messaging** → *Certificati push web* → genera la coppia di chiavi e copia la chiave pubblica in `vapidKey`.
6. Apri https://shell.cloud.google.com e lancia:
   ```
   git clone https://github.com/abdoullajrandom-source/coppia && bash coppia/deploy.sh ID_DEL_PROGETTO
   ```
   Pubblica le regole di sicurezza e la funzione delle notifiche.

## Collaudi

```
npm install
npx firebase emulators:exec --project demo-coppia --only firestore "node test/rules.test.mjs"
npx firebase emulators:exec --config firebase.emu.json --project demo-coppia --only auth,firestore "node test/e2e.mjs"   # serve l'app su localhost:8081
```
