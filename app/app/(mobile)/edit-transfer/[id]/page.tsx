import type { Metadata } from 'next';
import { EditTransferScreen } from '@/src/screens/EditTransfer/EditTransferScreen';

export const metadata: Metadata = {
  title: 'Edit transfer · Dreda',
};

export default async function EditTransferPage({ params }: PageProps<'/edit-transfer/[id]'>) {
  const { id } = await params;
  return <EditTransferScreen transferId={decodeURIComponent(id)} />;
}
