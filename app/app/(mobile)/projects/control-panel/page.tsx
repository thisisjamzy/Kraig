import type { Metadata } from 'next';
import { ComingSoonScreen } from '@/src/screens/ComingSoon/ComingSoonScreen';

// Time mode's own Control Panel — deliberately a different route from
// Money's real /settings, not a shared link between the two drawers (see
// src/widgets/WebSidebar/WebSidebar.tsx's own header comment on why the
// two modes never point the same nav item at the same URL).
export const metadata: Metadata = {
  title: 'Control Panel · Dreda',
};

export default function ProjectsControlPanelPage() {
  return <ComingSoonScreen title="Control Panel" message="Control Panel is coming soon." icon="settings" />;
}
