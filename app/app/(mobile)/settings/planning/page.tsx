import type { Metadata } from 'next';
import { PlanningSettingsScreen } from '@/src/routes/PlanningSettings/PlanningSettingsScreen';

export const metadata: Metadata = {
  title: 'Planning · Dreda',
};

export default function PlanningSettingsPage() {
  return <PlanningSettingsScreen />;
}
