'use client';

import { SplashScreen } from '@/src/screens/Splash/SplashScreen';
import { MarketingHomeScreen } from '@/src/screens/Marketing/MarketingHomeScreen';
import { useLogic } from '@/src/logic/appEntry/useLogic';

export function AppEntryScreen() {
  const { mode } = useLogic();

  if (mode === 'splash') {
    return <SplashScreen />;
  }

  if (mode === 'marketing') {
    return <MarketingHomeScreen />;
  }

  return null;
}
