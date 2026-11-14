'use client';

// A person on tablet and web (Dreda.figcraft `Person / Web`): who they are
// and how to reach them, what waits on you, what you wait on them for, and a
// dated history, with Archive at the bottom.

import { useRouter } from 'next/navigation';
import { usePerson } from '@/src/logic/people/useLogic';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { PersonBody, Avatar } from '@/src/widgets/People/People';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';

export function PersonScreen({ personId }: { personId: string }) {
  const router = useRouter();
  const { person, archive } = usePerson(personId);
  const name = person?.name ?? 'Person';
  return (
    <NotionPage
      title={name}
      icon={person ? <Avatar id={person.avatarId} size={32} /> : undefined}
      crumbs={[{ label: 'Time', href: '/projects' }, { label: 'People', href: '/people' }, { label: name }]}
      sub={person ? `${person.role || person.category} · ${person.waitingOnYou.length} waiting on you · ${person.youWaitFor.length} you are waiting for` : undefined}
    >
      {person ? (
        <PersonBody
          person={person}
          onArchive={() => {
            archive();
            router.push('/people');
          }}
        />
      ) : (
        <ScreenState loading={false} error="This person is not on your list. People are not saved yet, so anyone added earlier is gone after a reload." />
      )}
    </NotionPage>
  );
}
