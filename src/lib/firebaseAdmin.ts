import * as admin from "firebase-admin";

let _app: admin.app.App | null = null;

function init() {
  if (_app) return _app;
  if (admin.apps.length) { _app = admin.app(); return _app; }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    _app = admin.initializeApp({ credential: admin.credential.cert(json) });
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const pk = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && pk) {
    _app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: pk.replace(/\\n/g, "\n"),
      }),
    });
    return _app;
  }

  throw new Error("[firebaseAdmin] Missing credentials");
}

// Si ya tenías adminDB/adminAuth, puedes seguir exportándolos:
export const adminDB = (() => { init(); return admin.firestore(); })();
export const adminAuth = (() => { init(); return admin.auth(); })();

// Y añade los *getters* que tu route.ts está importando:
export function getAdminDB() { init(); return admin.firestore(); }
export function getAdminAuth() { init(); return admin.auth(); }
