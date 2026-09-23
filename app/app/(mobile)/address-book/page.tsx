import type { Metadata } from 'next';
import { ComingSoonScreen } from '@/src/screens/ComingSoon/ComingSoonScreen';

export const metadata: Metadata = {
  title: 'Address Book · Dreda',
};

export default function AddressBookPage() {
  return <ComingSoonScreen title="Address Book" message="Address Book is coming soon." icon="contact" />;
}
