import { redirect } from 'next/navigation';

// Payments now live in Planning's Payments tab.
export default function PaymentsPage() {
  redirect('/budget?tab=payments');
}
