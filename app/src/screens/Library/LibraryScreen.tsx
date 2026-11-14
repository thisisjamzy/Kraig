'use client';

// Library on tablet and web: Resources and the Archive in one home.

import { BookOpen } from 'lucide-react';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { LibraryBody } from '@/src/widgets/Library/Library';

export function LibraryScreen() {
  return (
    <NotionPage
      title="Library"
      icon={<BookOpen strokeWidth={1.75} />}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'Library', href: '/library' }]}
      sub="Everything you keep but are not working on right now: resources, and the archive."
    >
      <LibraryBody />
    </NotionPage>
  );
}
