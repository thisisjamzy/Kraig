import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSettingsSection, sectionInfo } from '@/src/logic/settingsCenter/sections';
import { SettingsSectionRoute } from '@/src/routes/Settings/SettingsRoutes';

export async function generateMetadata({ params }: PageProps<'/settings/[section]'>): Promise<Metadata> {
  const { section } = await params;
  return { title: `${isSettingsSection(section) ? sectionInfo(section).label : 'Settings'} · Dreda` };
}

export default async function SettingsSectionPage({ params }: PageProps<'/settings/[section]'>) {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsSectionRoute section={section} />;
}
