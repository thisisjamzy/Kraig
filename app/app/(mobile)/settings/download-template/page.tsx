import type { Metadata } from 'next';
import { DownloadTemplateScreen } from '@/src/screens/DownloadTemplate/DownloadTemplateScreen';

export const metadata: Metadata = {
  title: 'Download template · Dreda',
};

export default function DownloadTemplatePage() {
  return <DownloadTemplateScreen />;
}
