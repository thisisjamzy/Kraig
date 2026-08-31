import type { Metadata } from 'next';
import { OnboardingScreen } from '@/src/screens/Onboarding/OnboardingScreen';

export const metadata: Metadata = {
  title: 'Set up your ledger · Dreda',
};

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
