// Invia le notifiche push all'altra persona quando nell'app succede qualcosa
// ("ti penso", pausa gentile, chiamata fissata o spostata, data dell'incontro).
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
// Deve coincidere con la posizione del database Firestore.
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 });

exports.inviaNotifica = onDocumentCreated('couples/{cid}/notifs/{nid}', async (event) => {
  const n = event.data && event.data.data();
  if (!n) return;
  const db = admin.firestore();
  const couple = (await db.doc(`couples/${event.params.cid}`).get()).data();
  const members = (couple && couple.members) || [];
  if (n.from === n.to || !members.includes(n.from) || !members.includes(n.to)) return;

  const profileRef = db.doc(`couples/${event.params.cid}/profiles/${n.to}`);
  const tokens = ((await profileRef.get()).get('tokens') || []).filter(Boolean);
  if (!tokens.length) return;

  const title = String(n.title || 'Coppia').slice(0, 80);
  const body = String(n.body || '').slice(0, 200);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title, body, kind: String(n.kind || 'info') },
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
      notification: { title, body, icon: 'icons/icon-192.png' },
    },
  });

  // Toglie i token dei telefoni che non esistono più.
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(tokens[i]);
  });
  if (dead.length) await profileRef.update({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) });
});
