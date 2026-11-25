"use client";

// A category made from a picker (the transaction forms' "Add category",
// owner, 25 Nov 2026): a name and its money type, the rest as Settings'
// Create category leaves it. It is an ordinary category from then on, so
// it shows in every later picker of that type.

import { setDoc } from "firebase/firestore";
import { categoryRef } from "./refs";
import { guardWrite } from "./writeGuard";

export type CategoryKind = "Expense" | "Income" | "Savings";

async function createCategoryWrite(
  uid: string,
  name: string,
  transactionType: CategoryKind,
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(categoryRef(uid, id), {
    name: name.trim(),
    transactionType,
    group: null,
    notes: "",
    archived: false,
  });
  return id;
}

// Guarded against double submits (writeGuard.ts).
export const quickCreateCategory = guardWrite(
  "quickCreateCategory",
  createCategoryWrite,
);
