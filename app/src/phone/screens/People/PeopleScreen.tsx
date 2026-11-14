'use client';

// People on a phone (Dreda.figcraft `People / Phone`): the same groups and
// filters as the web page, with + for Add someone (its own page).

import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { usePeopleList } from '@/src/logic/people/useLogic';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { PeopleFilters, PeopleGroups } from '@/src/widgets/People/People';
import styles from '@/src/phone/screens/People/People.module.css';

export function PeopleScreen() {
  const list = usePeopleList();
  const goBack = useGoBack();
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.round} onClick={() => goBack('/projects')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="People"
        right={
          <Link href="/people/new" className={styles.round} aria-label="Add someone">
            <Plus size={16} strokeWidth={2.5} />
          </Link>
        }
      />
      <div className={styles.body}>
        <PeopleFilters value={list.filter} onChange={list.setFilter} counts={list.counts} />
        <PeopleGroups groups={list.groups} now={list.now} />
      </div>
    </div>
  );
}
