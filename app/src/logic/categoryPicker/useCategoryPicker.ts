"use client";

// The category picker on Add and Edit transaction (owner, 25 Nov 2026):
// every category of the type, this month's planned ones first, a search,
// and "Add category" when the one wanted isn't there. A new category is
// saved straight away and picked for this transaction; being an ordinary
// category, it is there for every transaction after.

import { useState } from "react";
import {
  quickCreateCategory,
  type CategoryKind,
} from "@/src/shared/firestore/categoryWrites";
import { useFirebaseUser } from "@/src/shared/hooks/useFirebaseUser";

export interface PickerCategory {
  id: string;
  name: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** The groups shown for a search: planned this month first, then the rest. */
export function categoryGroups(
  categories: PickerCategory[],
  planned: ReadonlySet<string> | null,
  search: string,
): { label: string; options: PickerCategory[] }[] {
  const q = norm(search);
  const shown = [...categories]
    .filter((c) => !q || norm(c.name).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!planned) return shown.length ? [{ label: "", options: shown }] : [];
  return [
    {
      label: "Planned this month",
      options: shown.filter((c) => planned.has(c.id)),
    },
    {
      label: planned.size ? "Other categories" : "",
      options: shown.filter((c) => !planned.has(c.id)),
    },
  ].filter((g) => g.options.length);
}

export function useCategoryPicker({
  categories,
  planned = null,
  kind,
  onPick,
}: {
  categories: PickerCategory[];
  /** Ids planned this month (Add transaction); null lists them all as one. */
  planned?: ReadonlySet<string> | null;
  /** The money type a new category gets; null: categories can't be added here (transfers). */
  kind: CategoryKind | null;
  onPick: (id: string) => void;
}) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [open, setOpenState] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = categoryGroups(categories, planned, search);
  const exact = categories.find((c) => norm(c.name) === norm(newName));

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) {
      setSearch("");
      setAdding(false);
      setNewName("");
      setError(null);
    }
  }
  function pick(id: string) {
    onPick(id);
    setOpen(false);
  }
  /** Opens the new-category field, with what was searched for as its name. */
  function startAdding() {
    setAdding(true);
    setNewName(search.trim());
    setError(null);
  }
  async function add() {
    const name = newName.trim();
    if (!name || busy || !kind || !uid) return;
    // Already there under that name: use it rather than make a second one.
    if (exact) return pick(exact.id);
    setBusy(true);
    setError(null);
    try {
      pick(await quickCreateCategory(uid, name, kind));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add this category.",
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    search,
    setSearch,
    groups,
    canAdd: kind !== null,
    adding,
    startAdding,
    cancelAdding: () => setAdding(false),
    newName,
    setNewName,
    /** "Use Groceries": the name typed is one that already exists. */
    addLabel: exact ? `Use ${exact.name}` : busy ? "Adding…" : "Add and use",
    busy,
    error,
    pick,
    add,
  };
}
