'use client';

// Resources: a Notion page holding the place for notes, links and files
// that support areas and projects. Nothing is stored yet; the page says so
// and points to where those live today.

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';

export function ResourcesScreen() {
  return (
    <NotionPage
      title="Resources"
      icon={<BookOpen strokeWidth={1.75} />}
      crumbs={[
        { label: 'Time', href: '/projects' },
        { label: 'Resources', href: '/resources' },
      ]}
      properties={[
        { id: 'count', label: 'Resources', display: '0' },
        { id: 'status', label: 'Status', display: 'Coming soon' },
      ]}
    >
      <Callout>
        <p>
          Resources will hold notes, links and files for your areas and projects. Until then, keep them in a project&apos;s notes on its page, under{' '}
          <Link href="/projects/all">Projects</Link>.
        </p>
      </Callout>
    </NotionPage>
  );
}
