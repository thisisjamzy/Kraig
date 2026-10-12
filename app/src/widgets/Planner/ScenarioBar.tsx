'use client';

// The scenario picker shared by the money and time plans: pick a saved
// plan, save the current one as a new plan, make the picked one active (the
// plan the rest of the app reads) or delete it. Every change in a plan
// saves to the picked scenario straight away.

import { useState } from 'react';
import type { Scenarios } from '@/src/logic/planner/useScenarios';
import charts from '@/src/widgets/Charts/Charts.module.css';
import p from './Planner.module.css';

export function ScenarioBar({ store }: { store: Scenarios }) {
  const [naming, setNaming] = useState<string | null>(null);
  return (
    <div className={p.scenario}>
      <label className={p.field}>
        Scenario
        <select value={store.current.id} onChange={(e) => store.pick(e.target.value)}>
          {store.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === store.activeId ? ' (active)' : ''}
            </option>
          ))}
        </select>
      </label>
      {store.isActive ? (
        <span className={charts.pill} data-tone="good">
          Active
        </span>
      ) : (
        <button type="button" className={p.small} onClick={store.makeActive}>
          Make active
        </button>
      )}
      {naming === null ? (
        <button type="button" className={p.small} onClick={() => setNaming(`Plan ${store.scenarios.length + 1}`)}>
          Save as new
        </button>
      ) : (
        <form
          className={p.nameForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim()) store.createScenario(naming.trim(), true);
            setNaming(null);
          }}
        >
          <label className={p.srOnly} htmlFor="scenario-name">
            Name of the new scenario
          </label>
          <input id="scenario-name" value={naming} onChange={(e) => setNaming(e.target.value)} autoFocus />
          <button type="submit" className={p.small} data-primary>
            Save
          </button>
          <button type="button" className={p.small} onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      )}
      {store.scenarios.length > 1 && !store.isActive && (
        <button type="button" className={p.small} onClick={store.deleteScenario}>
          Delete
        </button>
      )}
    </div>
  );
}
