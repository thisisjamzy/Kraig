'use client';

// A person on a phone: the same page as the web, stacked.

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { usePerson } from '@/src/logic/people/useLogic';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PersonBody } from '@/src/widgets/People/People';
import styles from '@/src/phone/screens/People/People.module.css';

export function PersonScreen({ personId }: { personId: string }) {
  const router = useRouter();
  const goBack = useGoBack();
  const { person, archive } = usePerson(personId);
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.round} onClick={() => goBack('/people')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={person?.name ?? 'Person'}
      />
      <div className={styles.body}>
        {person ? (
          <PersonBody
            person={person}
            onArchive={() => {
              archive();
              router.push('/people');
            }}
          />
        ) : (
          <ScreenState loading={false} error="This person is not on your list." />
        )}
      </div>
    </div>
  );
}
