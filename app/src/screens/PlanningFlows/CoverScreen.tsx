'use client';

// Cover or justify an overspend — a full page. A context card (what's
// over, by how much, and the payments that caused it), a sticky progress
// strip, then A. cover it by moving money planned elsewhere and B. explain
// it (always required), a review of every change, and Confirm.

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, CircleCheck, Search } from 'lucide-react';
import { useLogic } from '@/src/logic/planningCover/useLogic';
import { AVOIDABILITY, EXTERNAL_SOURCES, OVERSPEND_REASONS, money } from '@/src/viewmodels/planning';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import f from './Flows.module.css';
import c from './Cover.module.css';

function dayMonth(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function CoverScreen() {
  const v = useLogic();
  const [causesOpen, setCausesOpen] = useState(false);
  const [infoFor, setInfoFor] = useState<string | null>(null);

  const header = (
    <ScreenHeader
      center
      left={
        <button type="button" className={p.roundButton} onClick={v.goBack} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
      }
      title="Cover or justify"
    />
  );

  if (v.loading) {
    return (
      <div className={`${p.page} ${p.detail} ${f.page}`} aria-busy="true">
        {header}
        <div className={c.skeleton} aria-label="Loading">
          <span className={c.skelCard} />
          <span className={c.skelStrip} />
          <span className={c.skelLine} />
          <span className={c.skelRow} />
          <span className={c.skelRow} />
          <span className={c.skelRow} />
        </div>
      </div>
    );
  }

  if (v.need <= 0) {
    return (
      <div className={`${p.page} ${p.detail}`}>
        {header}
        <div className={c.empty}>
          <span className={c.emptyIcon} aria-hidden>
            <CircleCheck size={30} strokeWidth={2} />
          </span>
          <h2 className={c.emptyTitle}>{v.found ? 'This budget isn’t over anymore' : 'This budget couldn’t be found'}</h2>
          <p className={c.emptySub}>
            {v.found ? 'Nothing is left to cover or explain for this month.' : 'It may have been archived or removed.'}
          </p>
          <Link href={v.bucketHref} className={`${p.fillButton} ${p.bigButton}`}>
            Back to the bucket
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${p.page} ${p.detail} ${f.page}`}>
      {header}

      {/* 1. What's over */}
      <section className={c.context} aria-label="Overspend">
        <p className={c.contextName}>
          {v.contextName}
          {v.targetCount > 1 ? ` · ${v.targetCount} items over` : ''}
        </p>
        <div className={c.figures}>
          <span className={c.figure}>
            <span className={c.figureLabel}>Planned</span>
            <span className={c.figureValue}>{money(v.planned)}</span>
          </span>
          <span className={c.figure}>
            <span className={c.figureLabel}>Spent</span>
            <span className={c.figureValue}>{money(v.spent)}</span>
          </span>
          <span className={c.figure} data-tone="over">
            <span className={c.figureLabel}>Over</span>
            <span className={c.figureValue}>
              {money(v.need)} <small>{v.currency}</small>
            </span>
          </span>
        </div>
        {v.causes.length > 0 && (
          <>
            <button type="button" className={c.causesToggle} aria-expanded={causesOpen} onClick={() => setCausesOpen((o) => !o)}>
              <span>What caused it</span>
              <span className={c.causesCount}>
                {v.causes.length} {v.causes.length === 1 ? 'transaction' : 'transactions'}
                <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
              </span>
            </button>
            {causesOpen && (
              <ul className={c.causes}>
                {v.causes.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className={c.cause}>
                    <span className={c.causeText}>
                      <span className={c.causeName}>{row.note || row.name}</span>
                      <span className={c.causeMeta}>
                        {dayMonth(row.date)} · {row.method}
                      </span>
                    </span>
                    <span className={c.causeAmount}>
                      {money(Math.abs(row.amount))} <small>{v.currency}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Sticky progress */}
      <div className={c.progress} data-full={v.fullyCovered || undefined} aria-live="polite">
        <span className={c.progressText}>
          {v.fullyCovered ? (
            <>
              <Check size={15} strokeWidth={3} aria-hidden /> Fully covered
            </>
          ) : (
            <>
              Covered <strong>{money(v.progress)}</strong> of {money(v.need)} {v.currency}
            </>
          )}
        </span>
        <span className={c.progressBar}>
          <span className={c.progressFill} style={{ width: `${Math.min(100, (v.progress / v.need) * 100)}%` }} />
        </span>
      </div>

      {/* 2. Section A — move money */}
      <h2 className={c.heading}>Cover from other budgets</h2>
      <p className={c.subline}>Move money you planned elsewhere into this budget.</p>

      {v.sources.length === 0 ? (
        <p className={f.hint}>No other budget, unassigned income or savings has money available this month.</p>
      ) : (
        <>
          {v.manySources && (
            <label className={c.search}>
              <Search size={16} strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={v.search}
                onChange={(e) => v.setSearch(e.target.value)}
                placeholder="Search budgets"
                aria-label="Search budgets"
              />
            </label>
          )}
          <div className={c.sourceList}>
            {v.visibleSources.map((src) => {
              const picked = v.isPicked(src.id);
              const err = v.sourceError(src);
              const warn = v.sourceWarning(src);
              return (
                <div key={src.id} className={c.source} data-picked={picked || undefined}>
                  <div className={c.sourceTop}>
                    <button type="button" role="checkbox" aria-checked={picked} className={c.sourceMain} onClick={() => v.toggleSource(src.id)}>
                      <span className={c.check} aria-hidden>
                        {picked && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className={c.sourceText}>
                        <span className={c.sourceName}>{src.name}</span>
                        <span className={c.sourceSub}>
                          {src.sub} · {money(src.available)} {src.kind === 'savings' ? 'in savings' : 'available'}
                        </span>
                      </span>
                    </button>
                    {src.upcoming.count > 0 && (
                      <button
                        type="button"
                        className={c.warnIcon}
                        aria-label="Planned payments from this budget"
                        aria-expanded={infoFor === src.id}
                        onClick={() => setInfoFor((cur) => (cur === src.id ? null : src.id))}
                      >
                        <AlertTriangle size={16} strokeWidth={2.25} />
                      </button>
                    )}
                  </div>
                  {infoFor === src.id && <p className={c.info}>{v.upcomingText(src)}</p>}
                  {picked && (
                    <div className={c.amountRow}>
                      <span className={c.amountInput} data-error={err ? true : undefined}>
                        <input
                          inputMode="decimal"
                          placeholder="0"
                          value={v.amountText(src.id)}
                          onChange={(e) => v.setAmount(src.id, e.target.value)}
                          aria-label={`Amount from ${src.name}`}
                          aria-invalid={Boolean(err)}
                        />
                        <small>{v.currency}</small>
                      </span>
                      <span className={c.quickChips}>
                        <button type="button" onClick={() => v.quickFill(src.id, 'max')}>
                          max
                        </button>
                        <button type="button" onClick={() => v.quickFill(src.id, 'half')}>
                          half
                        </button>
                        <button type="button" onClick={() => v.quickFill(src.id, 'rest')}>
                          exact remainder
                        </button>
                      </span>
                    </div>
                  )}
                  {picked && err && <p className={c.error}>{err}</p>}
                  {picked && !err && warn && <p className={c.warning}>{warn}</p>}
                </div>
              );
            })}
          </div>
          {v.manySources && !v.search && (v.hiddenCount > 0 || v.showAll) && (
            <button type="button" className={p.textButton} onClick={() => v.setShowAll(!v.showAll)}>
              {v.showAll ? 'Show fewer' : `Show all (${v.hiddenCount} more)`}
            </button>
          )}
          {v.usesSavings && (
            <label className={`${f.field} ${c.landsIn}`}>
              Savings go into
              <select value={v.landsInId} onChange={(e) => v.setLandsIn(e.target.value)}>
                {v.spending.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      {/* 3. Section B — explain it (always) */}
      <h2 className={c.heading}>Explain what happened</h2>
      <p className={c.subline}>Every overspend gets a record, even when it’s fully covered.</p>

      <p className={c.question}>Why did it go over?</p>
      <div className={c.chips} role="radiogroup" aria-label="Why did it go over?">
        {OVERSPEND_REASONS.map((r) => (
          <button key={r.value} type="button" role="radio" aria-checked={v.reason === r.value} onClick={() => v.setReason(r.value)}>
            {r.label}
          </button>
        ))}
      </div>

      {(v.needsExternal || Object.keys(v.external).length > 0) && (
        <>
          <p className={c.question}>How was the extra paid for?</p>
          <p className={c.questionHint}>For the part not covered above. Pick all that apply.</p>
          <div className={c.chips}>
            {EXTERNAL_SOURCES.map((s) => (
              <button key={s.value} type="button" aria-pressed={s.value in v.external} onClick={() => v.toggleExternal(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          {EXTERNAL_SOURCES.filter((s) => s.value in v.external).map((s) => (
            <label key={s.value} className={c.externalRow}>
              <span>{s.label}</span>
              <span className={c.amountInput}>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={v.external[s.value] ?? ''}
                  onChange={(e) => v.setExternalAmount(s.value, e.target.value)}
                  aria-label={`Amount: ${s.label}`}
                />
                <small>{v.currency}</small>
              </span>
            </label>
          ))}
          <p className={c.tally} data-ok={Math.abs(v.difference) < 0.005 || undefined}>
            {money(v.accounted)} of {money(v.need)} {v.currency} accounted for
            {v.difference > 0.004
              ? ` · ${money(v.difference)} to go`
              : v.difference < -0.004
                ? ` · ${money(-v.difference)} too much`
                : ' · adds up'}
          </p>
        </>
      )}

      <p className={c.question}>When was this dealt with?</p>
      <div className={c.cards} role="radiogroup" aria-label="When was this dealt with?">
        <button type="button" role="radio" aria-checked={v.awareness === 'conscious'} className={c.bigCard} onClick={() => v.setAwareness('conscious')}>
          <span className={c.bigCardTitle}>Consciously, at the time</span>
          <span className={c.bigCardSub}>I knew I was going over and decided to move money when I spent it.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={v.awareness === 'discovered_later'}
          className={c.bigCard}
          onClick={() => v.setAwareness('discovered_later')}
        >
          <span className={c.bigCardTitle}>Discovered later</span>
          <span className={c.bigCardSub}>I only noticed after reviewing or reconciling the accounts.</span>
        </button>
      </div>
      {v.awareness === 'discovered_later' && (
        <label className={`${f.field} ${c.noticed}`}>
          Noticed on
          <input type="date" value={v.noticedOn} onChange={(e) => v.setNoticedOn(e.target.value)} required />
        </label>
      )}

      <p className={c.question}>Could it have been avoided?</p>
      <div className={c.chips} role="radiogroup" aria-label="Could it have been avoided?">
        {AVOIDABILITY.map((a) => (
          <button key={a.value} type="button" role="radio" aria-checked={v.avoidability === a.value} onClick={() => v.setAvoidability(a.value)}>
            {a.label}
          </button>
        ))}
      </div>

      <p className={c.question}>
        Note <span className={c.optional}>(optional)</span>
      </p>
      <textarea
        className={f.note}
        rows={3}
        value={v.note}
        onChange={(e) => v.setNote(e.target.value)}
        placeholder="Add details for your future self"
        aria-label="Note"
      />

      {/* 4. Review */}
      <section className={c.review} aria-label="Review">
        <h2 className={c.reviewTitle}>Review</h2>
        {v.review.lines.length === 0 ? (
          <p className={c.reviewLine}>Choose how it was covered and why, a summary appears here.</p>
        ) : (
          v.review.lines.map((line) => (
            <p key={line} className={c.reviewLine}>
              {line}
            </p>
          ))
        )}
        {v.review.changes.length > 0 && (
          <ul className={c.changes}>
            {v.review.changes.map((ch) => (
              <li key={ch.name}>
                <span>{ch.name}</span>
                <span className={c.changeFigures}>
                  {money(ch.before)} → <strong>{money(ch.after)}</strong> {ch.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(v.error || v.problem) && <p className={f.problem}>{v.error ?? v.problem}</p>}

      <div className={p.sticky}>
        <span className={p.stickyAmount}>
          <span className={p.stickyLabel}>to settle</span>
          <span className={p.stickyValue}>
            {money(v.need)}
            <small>{v.currency}</small>
          </span>
        </span>
        <button type="button" className={`${p.fillButton} ${p.bigButton} ${f.confirm}`} disabled={!v.canConfirm} onClick={v.confirm}>
          {v.busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
