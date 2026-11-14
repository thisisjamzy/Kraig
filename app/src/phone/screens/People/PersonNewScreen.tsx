'use client';

// Add someone on a phone (Dreda.figcraft `Person / New`), as a full-screen
// form. On wide screens the same form is a dialog on the People page.

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { usePeopleList, usePersonForm } from '@/src/logic/people/useLogic';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { PersonFormFields, peopleStyles } from '@/src/widgets/People/People';
import styles from '@/src/phone/screens/People/People.module.css';

export function PersonNewScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { categories } = usePeopleList();
  const form = usePersonForm((id) => router.replace(`/people/${id}`));
  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.round} onClick={() => goBack('/people')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title="Add someone"
      />
      <form
        className={styles.body}
        onSubmit={(e) => {
          e.preventDefault();
          form.save();
        }}
      >
        <PersonFormFields draft={form.draft} update={form.update} categories={categories} error={form.error} />
        <button type="submit" className={peopleStyles.primary}>
          Add person
        </button>
      </form>
    </div>
  );
}
