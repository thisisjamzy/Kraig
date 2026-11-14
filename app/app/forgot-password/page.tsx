import type { Metadata } from 'next';
import { ForgotPasswordScreen } from '@/src/screens/ForgotPassword/ForgotPasswordScreen';

export const metadata: Metadata = {
  title: 'Reset your password · Dreda',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
