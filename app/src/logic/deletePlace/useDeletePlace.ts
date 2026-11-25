"use client";

// Deleting an area or a folder for good, from its page or its edit form as
// well as from the Archive (owner, 25 Nov 2026): the same choice as a
// project, keep what's inside or delete it too (projectWrites.ts). Keep
// is the default. An area's default folder is every loose project's home,
// so it is never deleted on its own; it goes with its area.

import { useEffect, useState } from "react";
import {
  countPlaceContents,
  deleteAreaForGood,
  deleteSectionForGood,
} from "@/src/shared/firestore/projectWrites";
import { useFirebaseUser } from "@/src/shared/hooks/useFirebaseUser";

export interface PlaceToDelete {
  kind: "area" | "folder";
  id: string;
  name: string;
  /** A folder's area (where its contents move when kept). */
  areaId?: string | null;
}

export type InsideChoice = "keep" | "delete";

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** "3 projects and 42 tasks", or "" when empty. */
export function insideWords(
  inside: { projects: number; tasks: number } | null,
): string {
  if (!inside) return "";
  return [
    inside.projects ? count(inside.projects, "project") : "",
    inside.tasks ? count(inside.tasks, "task") : "",
  ]
    .filter(Boolean)
    .join(" and ");
}

export function useDeletePlace(place: PlaceToDelete | null) {
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [inside, setInside] = useState<{
    projects: number;
    tasks: number;
  } | null>(null);
  const [choice, setChoice] = useState<InsideChoice>("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = place ? `${place.kind}:${place.id}` : null;

  useEffect(() => {
    if (!uid || !place) return;
    let live = true;
    countPlaceContents(uid, place.kind, place.id)
      .then((c) => live && setInside(c))
      .catch(() => live && setInside({ projects: 0, tasks: 0 }));
    return () => {
      live = false;
      setInside(null);
      setChoice("keep");
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  const words = insideWords(inside);
  const keepHint =
    place?.kind === "folder"
      ? "They move to the area’s default folder."
      : "They stay, with no area or folder.";
  const choices = words
    ? [
        { value: "keep", label: `Keep its ${words}`, hint: keepHint },
        {
          value: "delete",
          label: `Delete its ${words} too`,
          hint: "Subtasks included. This also cannot be undone.",
        },
      ]
    : [];

  /** Deletes; true when done. */
  async function confirm(): Promise<boolean> {
    if (!uid || !place || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const deleteContents = choice === "delete" && Boolean(words);
      if (place.kind === "area")
        await deleteAreaForGood(uid, place.id, { deleteContents });
      else
        await deleteSectionForGood(uid, place.id, place.areaId ?? "", {
          deleteContents,
        });
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete this.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    counting: Boolean(place) && inside === null,
    choices,
    choice,
    setChoice: (v: string) => setChoice(v === "delete" ? "delete" : "keep"),
    deletesContents: choice === "delete" && Boolean(words),
    busy,
    error,
    confirm,
  };
}
