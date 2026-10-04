#!/usr/bin/env bash
# Da lanciare in Google Cloud Shell (https://shell.cloud.google.com):
# pubblica le regole di sicurezza del database e la funzione che invia le notifiche.
#   bash deploy.sh   (oppure: bash deploy.sh ID_DEL_PROGETTO)
set -euo pipefail
PROJECT="${1:-coppia-1da1a}"
cd "$(dirname "$0")"
FIREBASE="npx --yes firebase-tools@latest"
if ! $FIREBASE projects:list >/dev/null 2>&1; then
  echo "Prima serve un accesso a Firebase: apri il link che compare, scegli il tuo account Google e incolla qui il codice."
  $FIREBASE login --no-localhost
fi
(cd functions && npm install --no-audit --no-fund)
deploy() { $FIREBASE deploy --project "$PROJECT" --only firestore:rules,functions --non-interactive --force; }
if ! deploy; then
  # Al primo deploy Google deve ancora finire di attivare alcuni servizi: si riprova tra poco.
  echo "Aspetto un minuto e riprovo (al primo avvio è normale)..."
  sleep 60
  deploy
fi
echo
echo "Fatto! 💞 Puoi chiudere questa finestra."
