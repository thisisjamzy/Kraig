"use client";

// Scheduling on the phone (Dreda v1.0 `Scheduling / Phone` 70131):
// "Scheduling" with "3 links · 5 bookings this week" and + (New link);
// Links, Upcoming or Past. Each link: a bar in its colour, name, length,
// where and days, on and off, how many booked, Copy link and Share. Next
// bookings with Confirm. Each link has Edit and Delete (its bookings kept
// or deleted too); each booking can be deleted.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  useLogic,
  type SchedulingLogic,
} from "@/src/logic/schedulingLinks/useLogic";
import { plural } from "@/src/viewmodels/organise";
import { hueVars } from "@/src/viewmodels/projects";
import {
  bookingWhen,
  dayWords,
  openDays,
  type Booking,
  type SchedLink,
} from "@/src/viewmodels/scheduling-links";
import { ConfirmDialog } from "@/src/widgets/ConfirmDialog/ConfirmDialog";
import { Initials } from "@/src/widgets/TaskChips/Initials";
import { Switch } from "@/src/widgets/TaskChips/Switch";
import { HueTag } from "@/src/widgets/TaskChips/TypePill";
import {
  HeaderButton,
  TimeHeader,
} from "@/src/phone/widgets/TimeHeader/TimeHeader";
import styles from "@/src/phone/screens/SchedulingLinks/SchedulingLinksScreen.module.css";

type Tab = "links" | "upcoming" | "past";

export function SchedulingLinksScreen() {
  const router = useRouter();
  const s = useLogic();
  const [tab, setTab] = useState<Tab>("links");
  const next = s.upcoming.slice(0, 3);
  const [deleting, setDeleting] = useState<SchedLink | null>(null);
  const [keepBookings, setKeepBookings] = useState(true);
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);
  const deletingCount = deleting ? s.bookingsOf(deleting.id) : 0;

  return (
    <div className={styles.page}>
      <TimeHeader
        title="Scheduling"
        sub={`${plural(s.links.length, "link")} · ${plural(s.bookedThisWeek(null), "booking")} this week`}
        actions={
          <HeaderButton
            label="New link"
            onClick={() => router.push("/projects/calendar/links/new")}
          >
            <Plus size={20} strokeWidth={2} />
          </HeaderButton>
        }
      />
      <div className={styles.segmented} role="tablist" aria-label="Show">
        {(["links", "upcoming", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "links" ? "Links" : t === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {tab === "links" && (
        <>
          {s.links.map((l) => {
            const booked = s.bookedThisWeek(l.id);
            return (
              <article key={l.id} className={styles.card}>
                <div className={styles.linkHead}>
                  <span
                    className={styles.bar}
                    style={{ background: hueVars(l.hue).solid }}
                    aria-hidden
                  />
                  <span className={styles.linkText}>
                    <span className={styles.name}>{l.name}</span>
                    <span className={styles.meta}>
                      {l.minutes} min · {l.place} ·{" "}
                      {l.cadence === "one-off"
                        ? "One-off"
                        : dayWords(openDays(l))}
                    </span>
                  </span>
                  <Switch
                    checked={l.active}
                    onChange={(on) => s.setActive(l, on)}
                    label={`${l.name} is ${l.active ? "on" : "paused"}`}
                  />
                </div>
                <div className={styles.linkFoot}>
                  <span className={styles.meta}>
                    {l.active ? `${booked} booked this week` : "Paused"}
                  </span>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => void s.copy(l)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => s.send(l)}
                  >
                    Share
                  </button>
                </div>
                <div className={styles.linkFoot}>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() =>
                      router.push(
                        `/projects/calendar/links/new?edit=${encodeURIComponent(l.id)}`,
                      )
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    data-tone="danger"
                    onClick={() => {
                      setKeepBookings(true);
                      setDeleting(l);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {next.length > 0 && (
            <section className={styles.card} aria-label="Next bookings">
              <h2 className={styles.title}>
                Next bookings{" "}
                <span className={styles.count}>{s.upcoming.length}</span>
              </h2>
              {next.map((b) => (
                <BookingLine
                  key={b.id}
                  b={b}
                  s={s}
                  onDelete={() => setDeletingBooking(b)}
                />
              ))}
            </section>
          )}
        </>
      )}

      {tab !== "links" && (
        <section
          className={styles.card}
          aria-label={
            tab === "upcoming" ? "Upcoming bookings" : "Past bookings"
          }
        >
          {(tab === "upcoming" ? s.upcoming : s.past).length === 0 ? (
            <p className={styles.meta}>
              {tab === "upcoming"
                ? "Nothing booked yet."
                : "No past bookings yet."}
            </p>
          ) : (
            (tab === "upcoming" ? s.upcoming : s.past).map((b) => (
              <BookingLine
                key={b.id}
                b={b}
                s={s}
                onDelete={() => setDeletingBooking(b)}
              />
            ))
          )}
        </section>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="The link stops working at once and cannot be brought back."
          confirmLabel={
            !keepBookings && deletingCount
              ? "Delete link and bookings"
              : "Delete link"
          }
          cancelLabel="Cancel"
          choices={
            deletingCount
              ? [
                  {
                    value: "keep",
                    label: `Keep its ${plural(deletingCount, "booking")}`,
                    hint: "They stay in your bookings.",
                  },
                  {
                    value: "delete",
                    label: `Delete its ${plural(deletingCount, "booking")} too`,
                    hint: "The meetings come off your list.",
                  },
                ]
              : undefined
          }
          choice={keepBookings ? "keep" : "delete"}
          onChoice={(v) => setKeepBookings(v === "keep")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            s.removeLink(deleting, !keepBookings && deletingCount > 0);
            setDeleting(null);
          }}
        />
      )}
      {deletingBooking && (
        <ConfirmDialog
          title={`Delete the booking with ${deletingBooking.name}?`}
          message={`${bookingWhen(deletingBooking.at)}. It comes off your list and cannot be brought back.`}
          confirmLabel="Delete booking"
          cancelLabel="Keep it"
          onCancel={() => setDeletingBooking(null)}
          onConfirm={() => {
            s.removeBooking(deletingBooking);
            setDeletingBooking(null);
          }}
        />
      )}
    </div>
  );
}

function BookingLine({
  b,
  s,
  onDelete,
}: {
  b: Booking;
  s: SchedulingLogic;
  onDelete: () => void;
}) {
  return (
    <div className={styles.booking}>
      <Initials name={b.name} size={40} />
      <span className={styles.linkText}>
        <span className={styles.name}>{b.name}</span>
        <span className={styles.meta}>
          {s.linkOf(b)?.name ?? "Booking"} · {bookingWhen(b.at)}
        </span>
      </span>
      {b.status === "confirmed" ? (
        <HueTag hue="green">Confirmed</HueTag>
      ) : b.status === "declined" ? (
        <HueTag hue="grey">Declined</HueTag>
      ) : (
        <button
          type="button"
          className={styles.link}
          onClick={() => s.confirm(b)}
        >
          Confirm
        </button>
      )}
      <button
        type="button"
        className={styles.link}
        data-tone="danger"
        onClick={onDelete}
        aria-label={`Delete the booking with ${b.name}`}
      >
        Delete
      </button>
    </div>
  );
}
