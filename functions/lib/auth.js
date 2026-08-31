"use strict";
// onCreate Auth trigger (PRD-AUTH-FIREBASE.md's old auth.upsertUser job,
// corrected per PRD-FIREBASE.md section 10): creates the users/{uid}
// document the moment a Firebase account is first created — covers both
// email/password sign-up and a first-time OAuth sign-in. Also seeds default
// settings/exchangeRates under that same uid, mirroring
// src/shared/firestore/ensureUserDoc.ts's client-side version exactly (this
// project currently runs on the Spark plan with no Cloud Functions
// deployed, see firestore.rules' header — that client-side version is what
// actually runs today; this one is kept in sync for whenever/if this
// project upgrades to Blaze and redeploys functions/. If both ever run for
// the same brand-new account, whichever write lands first wins — harmless,
// both write the same shape).
//
// Deliberately the classic v1 `functions.auth.user().onCreate()` trigger,
// not the newer `beforeUserCreated` blocking function from
// firebase-functions/v2/identity: the v2 blocking-function mechanism needs
// Identity Platform enabled on the project, a manual setup step this
// doesn't need — v1 auth triggers remain fully supported for exactly this
// non-blocking "react to a new user" case, and mixing a v1 export alongside
// this project's other v2 functions is an explicitly supported pattern.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserCreate = void 0;
const functionsV1 = __importStar(require("firebase-functions/v1"));
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("./lib/firestore");
const DEFAULT_EXCHANGE_RATES = {
    XAF: { rateToBase: 1, notes: 'base currency' },
    EUR: { rateToBase: 655.957, notes: 'fixed peg' },
    USD: { rateToBase: 605, notes: 'approximate — update periodically' },
    GBP: { rateToBase: 765, notes: 'approximate — update periodically' },
};
exports.onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
    const userDoc = firestore_2.db.collection('users').doc(user.uid);
    await userDoc.set({
        email: (user.email ?? '').toLowerCase().trim(),
        name: user.displayName || '',
        archived: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        lastLoginAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await userDoc.collection('settings').doc('app').set({
        defaultCurrency: 'XAF',
        displayCurrency: 'XAF',
        timezone: 'UTC',
        householdName: user.displayName ? `${user.displayName}'s ledger` : 'My ledger',
    });
    await Promise.all(Object.entries(DEFAULT_EXCHANGE_RATES).map(([code, { rateToBase, notes }]) => userDoc.collection('exchangeRates').doc(code).set({ rateToBase, notes, updatedAt: firestore_1.FieldValue.serverTimestamp() })));
});
//# sourceMappingURL=auth.js.map