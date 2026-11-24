'use client';

// Ready to import (owner, 24 Nov 2026): every count known before the first
// write. Tasks, the new places they bring, the exact number of database
// writes and chunks, and what is left out and why.

import { useState } from 'react';
import type { TaskImport } from '@/src/logic/importData/useTaskImport';
import { listWords, plural } from './parts';
import s from './ImportFlow.module.css';

export function ImportPlanSummary({ v, onSeeLeftOut }: { v: TaskImport; onSeeLeftOut: () => void }) {
  const [which, setWhich] = useState(false);
  const p = v.runPlan;
  const plan = v.plan;
  if (!p || !plan) return null;
  const c = p.counts;
  const places = Object.values(p.places);
  const newPlaces = listWords([c.newAreas ? plural(c.newAreas, 'area') : '', c.newFolders ? plural(c.newFolders, 'folder') : '', c.newProjects ? plural(c.newProjects, 'project') : '']);
  const out = v.leftOut;
  const reasons = listWords([
    out.unticked ? `${out.unticked.toLocaleString('en-GB')} unticked` : '',
    out.duplicates ? plural(out.duplicates, 'duplicate') : '',
    out.clashes ? plural(out.clashes, 'time clash', 'time clashes') : '',
    out.look ? `${out.look.toLocaleString('en-GB')} need a look` : '',
  ]);
  return (
    <div className={s.flow}>
      <div className={s.card}>
        <p className={s.cardTitle}>Ready to import {p.fileName}</p>
        <dl className={s.counts}>
          <dt>Tasks</dt>
          <dd>
            {c.tasks.toLocaleString('en-GB')} of {plural(plan.counts.rows, 'row')} selected
          </dd>
          <dt>New places</dt>
          <dd>
            {newPlaces ? (
              <>
                {newPlaces} will be created for these tasks.{' '}
                <button type="button" className={s.linkButton} onClick={() => setWhich((w) => !w)} aria-expanded={which}>
                  {which ? 'Hide' : 'See which'}
                </button>
                {which && (
                  <ul>
                    {places.map((x) => (
                      <li key={x.id}>
                        {x.kind === 'area' ? 'Area' : x.kind === 'folder' ? 'Folder' : 'Project'} {x.name}
                        {x.kind === 'area' ? ', with its General folder' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              'None: every task goes into a place you already have.'
            )}
          </dd>
          <dt>Database</dt>
          <dd>
            {plural(c.writes, 'write')} in {plural(c.chunks, 'chunk')} of {v.chunkSize} tasks
            <span className={s.muted}>
              {' '}
              ({plural(c.parts.tasks, 'task')}, {plural(c.parts.places, 'place write')}, {plural(c.parts.log, 'log write')})
            </span>
          </dd>
          <dt>Not imported</dt>
          <dd>
            {out.total ? (
              <>
                {plural(out.total, 'row')}
                {reasons ? ` (${reasons})` : ''}.{' '}
                <button type="button" className={s.linkButton} onClick={onSeeLeftOut}>
                  See them
                </button>
              </>
            ) : (
              'Every row is going in.'
            )}
          </dd>
        </dl>
      </div>
      <p className={s.muted}>You can stop at any time. Tasks already in stay until you choose to keep or remove them.</p>
    </div>
  );
}
