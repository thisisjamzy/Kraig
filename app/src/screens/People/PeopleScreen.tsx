'use client';

// People on tablet and web (Dreda.figcraft `People / Web`): grouped by
// category, priority or A to Z, filtered by who is waiting on whom, with Add
// someone in a dialog. UI only for now: see src/logic/people.

import { TopBarActions, TopBarControls } from '@/src/widgets/AppShell/TopBarSlot';
import { useState } from 'react';
import { AtSign } from 'lucide-react';
import { usePeopleList, usePersonForm } from '@/src/logic/people/useLogic';
import type { PeopleSort } from '@/src/viewmodels/people';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { Modal } from '@/src/widgets/Modal/Modal';
import { PeopleFilters, PeopleGroups, PersonFormFields, peopleStyles } from '@/src/widgets/People/People';
import styles from './PeopleScreen.module.css';

const SORTS: { key: PeopleSort; label: string }[] = [
  { key: 'category', label: 'By category' },
  { key: 'priority', label: 'By priority' },
  { key: 'az', label: 'A to Z' },
];

export function PeopleScreen() {
  const list = usePeopleList();
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <NotionPage
      title="People"
      icon={<AtSign strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'People', href: '/people' }]}
      sub={`${list.counts.everyone} people you keep track of. Nobody is invited into Dreda: this is your own list, so you can see who is waiting on what.`}
    >
      <TopBarControls>
        <span className={styles.segmented} role="radiogroup" aria-label="Group">
          {SORTS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={list.sort === x.key} onClick={() => list.setSort(x.key)}>
              {x.label}
            </button>
          ))}
        </span>
      </TopBarControls>
      <TopBarActions>
        <button type="button" className={peopleStyles.primary} onClick={() => setAdding(list.categories[0])}>
          Add someone
        </button>
      </TopBarActions>
      <PeopleFilters value={list.filter} onChange={list.setFilter} counts={list.counts} />
      <PeopleGroups groups={list.groups} now={list.now} onAdd={list.sort === 'category' ? setAdding : undefined} />
      {adding !== null && <AddSomeone category={adding} categories={list.categories} onClose={() => setAdding(null)} />}
    </NotionPage>
  );
}

function AddSomeone({ category, categories, onClose }: { category: string; categories: string[]; onClose: () => void }) {
  const form = usePersonForm(onClose, category);
  return (
    <Modal title="Add someone" onClose={onClose}>
      <form
        className={styles.dialog}
        onSubmit={(e) => {
          e.preventDefault();
          form.save();
        }}
      >
        <PersonFormFields draft={form.draft} update={form.update} categories={categories} error={form.error} />
        <span className={styles.dialogActions}>
          <button type="button" className={peopleStyles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={peopleStyles.primary}>
            Add person
          </button>
        </span>
      </form>
    </Modal>
  );
}
