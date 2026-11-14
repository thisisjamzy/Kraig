import { redirect } from 'next/navigation';

// The money plan and forecast page is off until it is redesigned to be
// actionable; its code stays (src/routes/MoneyPlan, src/logic/moneyPlan).
// Old links and notifications land on Budget for the same month.
export default async function MoneyPlanPage({ searchParams }: PageProps<'/baskets/forecast'>) {
  const month = (await searchParams).month;
  redirect(typeof month === 'string' ? `/budget?month=${encodeURIComponent(month)}` : '/budget');
}
