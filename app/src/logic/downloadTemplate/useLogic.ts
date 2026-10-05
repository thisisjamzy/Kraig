'use client';

// /settings/download-template: the Time and Money templates, each one tap
// (useTemplateDownload makes the file with the person's own names).

import { useTemplateDownload } from '@/src/logic/importData/useTemplateDownload';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

export function useLogic() {
  const { download, busy, error, done } = useTemplateDownload();

  // Back to the page the user came from (skipping forms); '/settings' only
  // when there's no history — see src/shared/navigation/useGoBack.ts.
  const navigateBack = useGoBack();
  function goBack() {
    navigateBack('/settings');
  }

  return { download, busy, error, done, goBack };
}
