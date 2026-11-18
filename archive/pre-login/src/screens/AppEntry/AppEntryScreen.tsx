'use client';

import { SplashScreen } from '@/src/screens/Splash/SplashScreen';
import { MarketingHomeScreen } from '@/src/screens/Marketing/MarketingHomeScreen';
import { LoadingScreen } from '@/src/screens/Loading/LoadingScreen';
import { useLogic } from '@/src/logic/appEntry/useLogic';

export function AppEntryScreen() {
  const { mode } = useLogic();

  if (mode === 'splash') {
    return <SplashScreen />;
  }

  if (mode === 'marketing') {
    return <MarketingHomeScreen />;
  }

  // 'checking': this is what SSR itself sends down (isStandalonePwa() can
  // only run client-side, so the initial render always lands here) — show
  // the logo-centered loading screen instead of a blank page while the
  // effect above decides splash vs. forced sign-out and straight to
  // /sign-in.
  return <LoadingScreen />;
}
