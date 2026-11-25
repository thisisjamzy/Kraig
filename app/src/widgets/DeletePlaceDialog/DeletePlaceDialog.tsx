"use client";

// Delete an area or a folder for good: keep what's inside or delete it too,
// behind a type-the-name confirmation (logic/deletePlace/useDeletePlace.ts).

import {
  useDeletePlace,
  type PlaceToDelete,
} from "@/src/logic/deletePlace/useDeletePlace";
import { ConfirmDialog } from "@/src/widgets/ConfirmDialog/ConfirmDialog";
import { showToast } from "@/src/widgets/Toast/Toast";

export function DeletePlaceDialog({
  place,
  onCancel,
  onDeleted,
}: {
  place: PlaceToDelete;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const d = useDeletePlace(place);
  const what =
    place.kind === "area"
      ? "This deletes the area and its folders."
      : "This deletes the folder.";
  return (
    <ConfirmDialog
      title={`Delete ${place.name} for good?`}
      message={`${what} It cannot be undone. Archiving it instead keeps everything.${d.counting ? " Counting what is inside…" : ""}${d.error ? ` ${d.error}` : ""}`}
      typeToConfirm={place.name}
      confirmLabel={
        d.busy
          ? "Deleting…"
          : d.deletesContents
            ? "Delete everything"
            : "Delete for good"
      }
      cancelLabel="Cancel"
      choices={d.choices}
      choice={d.choice}
      onChoice={d.setChoice}
      onCancel={onCancel}
      onConfirm={() => {
        if (d.counting || d.busy) return;
        void d.confirm().then((ok) => {
          if (!ok) return;
          showToast(
            d.deletesContents
              ? `${place.name} and everything in it deleted`
              : `${place.name} deleted`,
          );
          onDeleted();
        });
      }}
    />
  );
}
