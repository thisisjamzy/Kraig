'use client';

// Cover or justify an overspend — a full page. Two options as large
// selectable cards (either or both): cover it from sources with money
// available, entering amounts until the bar is full; justify whatever's
// left with a reason chip and an optional note.

import { ArrowLeft, Check, Coins, MessageSquareText } from 'lucide-react';
import { useLogic } from '@/src/logic/planningCover/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money } from '@/src/viewmodels/planning';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import f from './Flows.module.css';

export function CoverScreen() {
  const c = useLogic();

  return (
    <div className={`${p.page} ${p.detail} ${f.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={c.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
      />

      <ScreenState loading={c.loading} error={!c.loading && c.need <= 0 ? 'Nothing here is over budget any more.' : null} />

      {!c.loading && c.need > 0 && (
        <>
          <h1 className={f.headline} data-tone="over">
            Over by {money(c.need)} {c.currency}
          </h1>
          <p className={f.on}>
            on <strong>{c.targetName}</strong>
            {c.targetCount > 1 ? ` · ${c.targetCount} items` : ''}
          </p>

          <div className={f.progress}>
            <div className={f.progressBar}>
              <div className={f.progressCovered} style={{ width: `${Math.min(100, (c.covered / c.need) * 100)}%` }} />
              {c.justifyOn && c.left > 0 && c.reason && (
                <div
                  className={f.progressJustified}
                  style={{ left: `${Math.min(100, (c.covered / c.need) * 100)}%`, width: `${(c.left / c.need) * 100}%` }}
                />
              )}
            </div>
            <span className={f.progressText}>
              {money(c.covered)} covered
              {c.justifyOn && c.left > 0 && c.reason ? ` · ${money(c.left)} justified` : c.left > 0 ? ` · ${money(c.left)} to go` : ' · all covered'}
            </span>
          </div>

          {/* Option 1 — cover it */}
          <button type="button" className={f.option} aria-pressed={c.coverOn} onClick={() => c.setCoverOn(!c.coverOn)}>
            <span className={f.optionIcon} aria-hidden>
              <Coins size={20} strokeWidth={2} />
            </span>
            <span className={f.optionText}>
              <span className={f.optionTitle}>Cover it</span>
              <span className={f.optionSub}>Move money in from somewhere with money left</span>
            </span>
            <span className={f.optionCheck} aria-hidden>
              {c.coverOn && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
          {c.coverOn && (
            <div className={f.sources}>
              {c.sources.length === 0 && <p className={f.hint}>No bucket, income or savings has money available this month.</p>}
              {c.sources.map((src) => (
                <div key={src.id} className={f.source}>
                  <span className={f.sourceText}>
                    <span className={f.sourceName}>{src.label}</span>
                    <span className={f.sourceSub}>
                      {money(src.available)} {c.currency} available · {src.sub}
                    </span>
                  </span>
                  <span className={f.sourceInput}>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={c.amounts[src.id] ?? ''}
                      onChange={(e) => c.setAmount(src.id, e.target.value.replace(/[^\d.]/g, ''))}
                      aria-label={`Amount from ${src.label}`}
                    />
                    <button type="button" onClick={() => c.fill(src.id)}>
                      Max
                    </button>
                  </span>
                </div>
              ))}
              {c.usesSavings && (
                <label className={f.field}>
                  Savings land in
                  <select value={c.landsInId} onChange={(e) => c.setLandsIn(e.target.value)}>
                    {c.spending.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Option 2 — justify it */}
          <button type="button" className={f.option} aria-pressed={c.justifyOn} onClick={() => c.setJustifyOn(!c.justifyOn)}>
            <span className={f.optionIcon} aria-hidden>
              <MessageSquareText size={20} strokeWidth={2} />
            </span>
            <span className={f.optionText}>
              <span className={f.optionTitle}>Justify it</span>
              <span className={f.optionSub}>
                {c.left > 0 ? `Explain the ${money(c.left)} ${c.currency} not covered` : 'Nothing left to justify'}
              </span>
            </span>
            <span className={f.optionCheck} aria-hidden>
              {c.justifyOn && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
          {c.justifyOn && (
            <div className={f.sources}>
              <div className={f.reasonChips} role="radiogroup" aria-label="Reason">
                {c.reasons.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={c.reason === r} onClick={() => c.setReason(r)}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <textarea
                className={f.note}
                rows={3}
                value={c.note}
                onChange={(e) => c.setNote(e.target.value)}
                placeholder="Add a note (optional)"
                aria-label="Note"
              />
            </div>
          )}

          {(c.problem || c.error) && <p className={f.problem}>{c.error ?? c.problem}</p>}

          <div className={p.sticky}>
            <button type="button" className={`${p.fillButton} ${p.bigButton} ${f.confirm}`} disabled={!c.canConfirm} onClick={c.confirm}>
              {c.busy ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
