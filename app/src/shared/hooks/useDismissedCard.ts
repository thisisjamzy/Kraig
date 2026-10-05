'use client';

// One action card's dismissal: hidden while its state is the one that was
// dismissed (src/shared/settings/dismissals.ts), stored in the preferences
// doc so every device agrees. dismiss() hides it at once and shows a short
// toast with Undo.

import { useState } from 'react';
import { deleteField, setDoc } from 'firebase/firestore';
import { preferencesRef, usePreferences } from '@/src/shared/firestore/preferences';
import { dismissalOf, isCardHidden, type CardState } from '@/src/shared/settings/dismissals';
import { showToast } from '@/src/widgets/Toast/Toast';

export function useDismissedCard(cardId: string, state: CardState | null) {
  const { prefs, loading, uid } = usePreferences();
  // Hidden at once, before the write comes back.
  const [justDismissed, setJustDismissed] = useState<string | null>(null);
  const stateKey = state ? JSON.stringify(dismissalOf(state)) : null;
  const hidden = loading || !state || justDismissed === stateKey || isCardHidden(prefs.dismissedCards, cardId, state);

  function dismiss(label = 'Card hidden') {
    if (!uid || !state) return;
    setJustDismissed(stateKey);
    const ref = preferencesRef(uid);
    void setDoc(ref, { dismissedCards: { [cardId]: dismissalOf(state) } }, { merge: true });
    showToast(label, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          setJustDismissed(null);
          void setDoc(ref, { dismissedCards: { [cardId]: deleteField() } } as never, { merge: true });
        },
      },
    });
  }

  return { hidden, dismiss };
}
