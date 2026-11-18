'use client';

// The landing page: the install dialog, and the invite request form. There is
// no request-access store yet, so the form validates and shows the "invite
// requested" state without sending anything; this hook is where the request
// is saved once that store exists.

import { useState, type FormEvent } from 'react';

export function useLogic() {
  const [installOpen, setInstallOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [first, setFirst] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email you want the invite sent to.');
      return;
    }
    setError(null);
    setRequested(true);
  }

  return {
    installOpen,
    openInstall: () => setInstallOpen(true),
    closeInstall: () => setInstallOpen(false),
    form: { email, setEmail, name, setName, first, setFirst, notify, setNotify, error, requested, submit },
  };
}
