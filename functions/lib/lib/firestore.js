"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.adminApp = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// Cloud Functions runtime provides application-default credentials
// automatically — no cert()/service-account plumbing needed here the way
// the Next.js app's admin SDK usage did (that's gone now anyway, see
// PRD-FIREBASE.md section 1).
exports.adminApp = (0, app_1.getApps)().length ? (0, app_1.getApps)()[0] : (0, app_1.initializeApp)();
exports.db = (0, firestore_1.getFirestore)(exports.adminApp);
//# sourceMappingURL=firestore.js.map