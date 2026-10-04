'use client';

// Bucket details' "Adjustments" section — a timeline of budget moves and
// overspend settlements — and the sheet one opens into: read-only, with
// Edit (a settlement's explanation) and Undo (reverts it; nothing is
// deleted, it stays here marked reverted).

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { AVOIDABILITY, OVERSPEND_REASONS, money } from '@/src/viewmodels/planning';
import type { AdjustmentEntry } from '@/src/logic/planning/adjustments';
import type { OverspendAvoidability, OverspendAwareness, OverspendReason } from '@/src/shared/firestore/types';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/PlanningBucket/Adjustments.module.css';

function dayMonth(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function AdjustmentRow({ entry, currency, onOpen }: { entry: AdjustmentEntry; currency: string; onOpen: () => void }) {
  return (
    <button type="button" className={styles.row} data-reverted={entry.reverted || undefined} onClick={onOpen}>
      <span className={styles.icon} aria-hidden>
        <Repeat size={16} strokeWidth={2.25} />
      </span>
      <span className={styles.main}>
        <span className={styles.title}>{entry.title}</span>
        <span className={styles.meta}>
          {entry.date ? dayMonth(entry.date) : 'Saving…'}
          {entry.reason && <span className={p.chip}>{entry.reason}</span>}
          {entry.discoveredLater && (
            <span className={p.chip} data-tone="neutral">
              discovered later
            </span>
          )}
          {entry.reverted && (
            <span className={p.chip} data-tone="neutral">
              reverted
            </span>
          )}
        </span>
      </span>
      <span className={styles.amount}>
        {money(entry.amount)} <small>{currency}</small>
      </span>
    </button>
  );
}

type EditFields = {
  reason: OverspendReason;
  awareness: OverspendAwareness;
  noticedOn: Date | null;
  avoidability: OverspendAvoidability;
  note: string;
};

function inputDate(d: Date | null) {
  const x = d ?? new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function AdjustmentSheet({
  entry,
  currency,
  busy,
  error,
  onClose,
  onUndo,
  onSave,
}: {
  entry: AdjustmentEntry;
  currency: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onUndo: () => void;
  onSave: (fields: EditFields) => void;
}) {
  const j = entry.justification;
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmUndo'>('view');
  const [reason, setReason] = useState<OverspendReason>(j?.reason ?? 'other');
  const [awareness, setAwareness] = useState<OverspendAwareness>(j?.awareness ?? 'conscious');
  const [noticedOn, setNoticedOn] = useState(inputDate(j?.noticedOn?.toDate() ?? null));
  const [avoidability, setAvoidability] = useState<OverspendAvoidability>(j?.avoidability ?? 'unavoidable');
  const [note, setNote] = useState(j?.note ?? '');

  if (mode === 'edit' && j) {
    return (
      <Modal title="Edit explanation" onClose={onClose}>
        <div className={styles.form}>
          <p className={styles.label}>Why did it go over?</p>
          <div className={styles.chips} role="radiogroup" aria-label="Why did it go over?">
            {OVERSPEND_REASONS.map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={reason === r.value} onClick={() => setReason(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
          <p className={styles.label}>When was this dealt with?</p>
          <div className={styles.chips} role="radiogroup" aria-label="When was this dealt with?">
            <button type="button" role="radio" aria-checked={awareness === 'conscious'} onClick={() => setAwareness('conscious')}>
              Consciously, at the time
            </button>
            <button type="button" role="radio" aria-checked={awareness === 'discovered_later'} onClick={() => setAwareness('discovered_later')}>
              Discovered later
            </button>
          </div>
          {awareness === 'discovered_later' && (
            <label className={styles.field}>
              Noticed on
              <input type="date" value={noticedOn} onChange={(e) => setNoticedOn(e.target.value)} required />
            </label>
          )}
          <p className={styles.label}>Could it have been avoided?</p>
          <div className={styles.chips} role="radiogroup" aria-label="Could it have been avoided?">
            {AVOIDABILITY.map((a) => (
              <button key={a.value} type="button" role="radio" aria-checked={avoidability === a.value} onClick={() => setAvoidability(a.value)}>
                {a.label}
              </button>
            ))}
          </div>
          <label className={styles.field}>
            Note
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add details for your future self" />
          </label>
          <p className={styles.hint}>To change the amounts, undo this settlement and settle it again.</p>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" className={p.textButton} onClick={() => setMode('view')}>
              Cancel
            </button>
            <button
              type="button"
              className={p.fillButton}
              disabled={busy || (awareness === 'discovered_later' && !noticedOn)}
              onClick={() =>
                onSave({
                  reason,
                  awareness,
                  noticedOn: awareness === 'discovered_later' ? new Date(`${noticedOn}T12:00`) : null,
                  avoidability,
                  note,
                })
              }
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={entry.kind === 'settlement' ? 'Overspend settlement' : 'Budget move'} onClose={onClose}>
      <div className={styles.detail}>
        <p className={styles.big}>
          {money(entry.amount)} <small>{currency}</small>
          {entry.reverted && (
            <span className={p.chip} data-tone="neutral">
              reverted
            </span>
          )}
        </p>
        {entry.date && <p className={styles.hint}>Recorded {entry.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}

        {entry.moves.length > 0 && (
          <ul className={styles.lines}>
            {entry.moves.map((m, i) => (
              <li key={i}>
                <span>
                  {m.from} → {m.to}
                </span>
                <strong>{money(m.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
        {(entry.external.length > 0 || entry.open > 0) && (
          <ul className={styles.lines}>
            {entry.external.map((e) => (
              <li key={e.label}>
                <span>{e.label}</span>
                <strong>{money(e.amount)}</strong>
              </li>
            ))}
            {entry.open > 0 && (
              <li data-tone="over">
                <span>Not covered yet</span>
                <strong>{money(entry.open)}</strong>
              </li>
            )}
          </ul>
        )}

        {entry.reason && (
          <p className={styles.why}>
            {[
              entry.reason,
              entry.discoveredLater
                ? `Discovered later${entry.noticedOn ? ` on ${dayMonth(entry.noticedOn)}` : ''}`
                : entry.justification
                  ? 'Handled at the time'
                  : null,
              entry.avoidability,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {entry.note && <p className={styles.note}>“{entry.note}”</p>}
        {entry.kind === 'move' && entry.justification && (
          <p className={styles.hint}>Part of an overspend settlement, undoing it undoes the whole settlement.</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {!entry.reverted &&
          (mode === 'confirmUndo' ? (
            <div className={styles.confirm}>
              <p>
                The money goes back where it came from
                {entry.justification ? ' and the explanation is marked reverted' : ''}. Nothing is deleted.
              </p>
              <div className={styles.actions}>
                <button type="button" className={p.textButton} onClick={() => setMode('view')}>
                  Keep it
                </button>
                <button type="button" className={p.fillButton} data-tone="over" disabled={busy} onClick={onUndo}>
                  {busy ? 'Undoing…' : 'Undo'}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              {j && entry.kind === 'settlement' && (
                <button type="button" className={p.textButton} onClick={() => setMode('edit')}>
                  Edit
                </button>
              )}
              <button type="button" className={p.fillButton} data-tone="over" onClick={() => setMode('confirmUndo')}>
                Undo
              </button>
            </div>
          ))}
      </div>
    </Modal>
  );
}
