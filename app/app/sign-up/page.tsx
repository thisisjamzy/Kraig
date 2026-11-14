import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignUpScreen } from '@/src/screens/SignUp/SignUpScreen';

export const metadata: Metadata = {
  title: 'Sign up · Dreda',
};

// The invite code can arrive in the link (?code=), read with
// useSearchParams, which needs a Suspense boundary to prerender.
export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpScreen />
    </Suspense>
  );
}
