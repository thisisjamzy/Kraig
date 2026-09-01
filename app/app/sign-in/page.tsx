import type { Metadata } from 'next';
import { SignInScreen } from '@/src/screens/SignIn/SignInScreen';

export const metadata: Metadata = {
  title: 'Sign in · Dreda',
};

export default function SignInPage() {
  return <SignInScreen />;
}
