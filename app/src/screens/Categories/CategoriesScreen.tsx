'use client';

import { ChevronLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLogic } from '@/src/logic/categories/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './CategoriesScreen.module.css';

export function CategoriesScreen() {
  const strings = useStrings();
  const { groups, loading, error, goBack } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.categories.title}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && groups.length === 0 && (
        <p className={styles.emptyText}>{strings.categories.empty}</p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className={styles.groupList}>
          {groups.map((group) => (
            <div key={group.transactionType}>
              <h2 className={styles.groupTitle}>{strings.budget.typeLabels[group.transactionType]}</h2>
              <div className={styles.categoryList}>
                {group.categories.map((category) => (
                  <p key={category.id} className={styles.categoryRow}>
                    {category.name}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.fabRow}>
        <Link
          href="/create-category?returnTo=/categories"
          className={styles.fab}
          aria-label={strings.categories.createCta}
        >
          <Plus size={24} strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
}
