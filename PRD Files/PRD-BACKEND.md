# Dreda: backend (superseded)

This document's data-layer plan (Google Sheets and Apps Script as the primary datastore) has
been replaced. The current architecture, Firestore as the primary datastore, Cloud Functions
maintaining precomputed statistics, and Security Rules as the access boundary, is specced in
`PRD-FIREBASE.md`. Read that file first.

`PRD-AUTH-FIREBASE.md` still covers the actual auth provider mechanics (Google and Apple sign-in,
`signInWithRedirect`, the Apple one-time-name quirk), corrected in two small places by
`PRD-FIREBASE.md` section 1 and section 10 (where the `Users` data lives, and how the PIN is set
and verified).

The `sheets/` folder (the workbook, `Code.gs`, `SCHEMA.md`, `SETUP.md`) stays in the repo as the
seed data source for the one-off Firestore migration script `PRD-FIREBASE.md` section 11
describes, and as historical reference for the field shapes. It is no longer the live backend.
