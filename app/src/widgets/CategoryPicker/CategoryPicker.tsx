"use client";

// A Category row that opens a picker (logic/categoryPicker): a search, the
// categories in groups (planned this month first), and "Add category" at
// the foot. Full screen on a phone, clear of the notch; a dialog on wider
// screens. Used by Add transaction and Edit transaction.

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Search, X } from "lucide-react";
import {
  useCategoryPicker,
  type PickerCategory,
} from "@/src/logic/categoryPicker/useCategoryPicker";
import type { CategoryKind } from "@/src/shared/firestore/categoryWrites";
import { useLayout } from "@/src/shared/hooks/useLayout";
import { RowShell } from "@/src/widgets/TransactionPanel/TransactionPanel";
import panel from "@/src/widgets/TransactionPanel/TransactionPanel.module.css";
import s from "./CategoryPicker.module.css";

export function CategoryRow({
  icon,
  label,
  value,
  onChange,
  categories,
  planned,
  kind,
  placeholder = "Choose one",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (id: string) => void;
  categories: PickerCategory[];
  planned?: ReadonlySet<string> | null;
  kind: CategoryKind | null;
  placeholder?: string;
}) {
  const { isWide } = useLayout();
  const p = useCategoryPicker({ categories, planned, kind, onPick: onChange });
  const chosen = categories.find((c) => c.id === value);
  const { setOpen } = p;

  useEffect(() => {
    if (!p.open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [p.open, setOpen]);

  const total = p.groups.reduce((n, g) => n + g.options.length, 0);
  return (
    <>
      <button
        type="button"
        className={panel.rowButton}
        onClick={() => p.setOpen(true)}
        aria-haspopup="dialog"
      >
        <RowShell icon={icon} label={label} className={panel.pickRow}>
          <span
            className={panel.value}
            data-placeholder={chosen ? undefined : ""}
          >
            {chosen?.name ?? placeholder}
          </span>
        </RowShell>
      </button>
      {p.open &&
        createPortal(
          <div
            className={s.scrim}
            data-wide={isWide || undefined}
            onClick={() => p.setOpen(false)}
          >
            <div
              className={s.sheet}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={s.head}>
                <h2 className={s.title}>{label}</h2>
                <button
                  type="button"
                  className={s.close}
                  onClick={() => p.setOpen(false)}
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>
              <label className={s.search}>
                <Search size={18} strokeWidth={2} aria-hidden />
                <input
                  type="search"
                  value={p.search}
                  onChange={(e) => p.setSearch(e.target.value)}
                  placeholder={`Search ${categories.length} ${categories.length === 1 ? "category" : "categories"}`}
                  aria-label="Search categories"
                  autoFocus={isWide}
                />
              </label>
              <div className={s.body}>
                {p.groups.map((g) => (
                  <div key={g.label || "all"} className={s.group}>
                    {g.label && <p className={s.groupLabel}>{g.label}</p>}
                    {g.options.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={s.option}
                        aria-pressed={c.id === value}
                        onClick={() => p.pick(c.id)}
                      >
                        <span>{c.name}</span>
                        {c.id === value && (
                          <Check size={18} strokeWidth={2.25} aria-hidden />
                        )}
                      </button>
                    ))}
                  </div>
                ))}
                {total === 0 && (
                  <p className={s.empty}>
                    {p.search.trim()
                      ? `No category called “${p.search.trim()}”.`
                      : "No categories of this type yet."}
                  </p>
                )}
              </div>
              {p.canAdd && (
                <div className={s.foot}>
                  {p.adding ? (
                    <form
                      className={s.addForm}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void p.add();
                      }}
                    >
                      <input
                        className={s.addInput}
                        value={p.newName}
                        onChange={(e) => p.setNewName(e.target.value)}
                        placeholder="New category name"
                        aria-label="New category name"
                        autoFocus
                      />
                      <div className={s.addActions}>
                        <button
                          type="button"
                          className={s.secondary}
                          onClick={p.cancelAdding}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={s.primary}
                          disabled={!p.newName.trim() || p.busy}
                        >
                          {p.addLabel}
                        </button>
                      </div>
                      {p.error && <p className={s.error}>{p.error}</p>}
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={s.addButton}
                      onClick={p.startAdding}
                    >
                      <Plus size={18} strokeWidth={2} aria-hidden />
                      {p.search.trim() && total === 0
                        ? `Add “${p.search.trim()}” as a category`
                        : "Add category"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
