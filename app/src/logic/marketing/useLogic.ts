'use client';

import { useState } from 'react';

export function useLogic() {
  const [installOpen, setInstallOpen] = useState(false);
  return { installOpen, openInstall: () => setInstallOpen(true), closeInstall: () => setInstallOpen(false) };
}
