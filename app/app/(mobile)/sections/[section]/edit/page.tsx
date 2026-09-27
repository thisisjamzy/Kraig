import type { Metadata } from 'next';
import { SectionEditScreen } from '@/src/screens/SectionEdit/SectionEditScreen';

export const metadata: Metadata = {
  title: 'Edit section · Dreda',
};

export default async function SectionEditPage({ params }: PageProps<'/sections/[section]/edit'>) {
  const { section } = await params;
  return <SectionEditScreen bucketId={decodeURIComponent(section)} />;
}
