"use strict";
// setPin / verifyPin Callable Functions (PRD-FIREBASE.md section 10). A
// Callable Function automatically receives and verifies the caller's
// Firebase ID token — no manual token/cookie plumbing — and runs on Node,
// so bcryptjs works unchanged. The Admin SDK here reaches
// users/{uid}/private/pin directly, the one place Security Rules block
// every client request outright (section 9).
//
// Both check `archived` themselves: Callable Functions run through the
// Admin SDK, which bypasses Security Rules entirely, so the rules-based
// archived check every other collection gets doesn't apply here — this is
// the one place that check has to be written by hand, mirroring what
// PRD-AUTH-FIREBASE.md's old auth.upsertUser used to refuse on.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPin = exports.setPin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const firestore_2 = require("./lib/firestore");
const PIN_LENGTH = 5;
const pinSchema = zod_1.z.string().length(PIN_LENGTH).regex(/^\d+$/);
async function requireActiveUser(uid) {
    const snap = await firestore_2.db.collection('users').doc(uid).get();
    if (snap.data()?.archived) {
        throw new https_1.HttpsError('permission-denied', "This account's access has been revoked.");
    }
}
exports.setPin = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Not signed in.');
    await requireActiveUser(request.auth.uid);
    const parsed = pinSchema.safeParse(request.data?.pin);
    if (!parsed.success)
        throw new https_1.HttpsError('invalid-argument', 'Enter a 5-digit PIN.');
    const pinHash = await bcryptjs_1.default.hash(parsed.data, 12);
    await firestore_2.db
        .doc(`users/${request.auth.uid}/private/pin`)
        .set({ pinHash, updatedAt: firestore_1.FieldValue.serverTimestamp() });
    // Echoed back so the client can cache it (PIN_HASH_CACHE_KEY) for fast,
    // offline PIN re-checks — a bcrypt hash is safe to keep client-side by
    // design, it's one-way, this is not the PIN itself.
    return { ok: true, pinHash };
});
exports.verifyPin = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Not signed in.');
    await requireActiveUser(request.auth.uid);
    const parsed = pinSchema.safeParse(request.data?.pin);
    if (!parsed.success)
        throw new https_1.HttpsError('invalid-argument', 'Enter a 5-digit PIN.');
    const snap = await firestore_2.db.doc(`users/${request.auth.uid}/private/pin`).get();
    const pinHash = snap.data()?.pinHash;
    if (!pinHash) {
        // No PIN set yet for this account — the client should route to the
        // "set your PIN" variant instead of retrying verify.
        return { ok: false, code: 'NO_PIN' };
    }
    const valid = await bcryptjs_1.default.compare(parsed.data, pinHash);
    if (!valid)
        return { ok: false, error: 'Incorrect PIN.' };
    return { ok: true, pinHash };
});
//# sourceMappingURL=pin.js.map