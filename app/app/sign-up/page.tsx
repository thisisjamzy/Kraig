import type { Metadata } from 'next';
import { SignUpScreen } from '@/src/screens/SignUp/SignUpScreen';

export const metadata: Metadata = {
  title: 'Sign up · Dreda',
};

export default function SignUpPage() {
  return <SignUpScreen />;
}
