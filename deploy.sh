#!/usr/bin/env bash
# Da lanciare in Google Cloud Shell (https://shell.cloud.google.com):
# pubblica le regole di sicurezza del database e la funzione che invia le notifiche.
#   bash deploy.sh ID_DEL_PROGETTO
set -euo pipefail
PROJECT="${1:?Scrivi l'ID del progetto Firebase dopo il comando, es: bash deploy.sh coppia-12345}"
cd "$(dirname "$0")"
FIREBASE="npx --yes firebase-tools@latest"
if ! $FIREBASE projects:list >/dev/null 2>&1; then
  echo "Prima serve un accesso a Firebase: apri il link che compare, scegli il tuo account Google e incolla qui il codice."
  $FIREBASE login --no-localhost
fi
(cd functions && npm install --no-audit --no-fund)
$FIREBASE deploy --project "$PROJECT" --only firestore:rules,functions --non-interactive --force
echo
echo "Fatto! 💞 Puoi chiudere questa finestra."
