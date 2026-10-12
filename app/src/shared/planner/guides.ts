// "How to read this": the money and time plans' guides
// (Remix/Priorities/priorities-forecasting-brief.md, section 9), shown by
// each card's info button. The safety buffer is a dashed line in the
// accent here, not orange. UK English, no long dashes.

export const PLAN_GUIDE = {
  forecast: {
    title: 'How to read the balance forecast',
    text: 'The line is the money you are expected to have each day, after every planned payment, income and savings transfer. Read it from left to right. When you have made changes, the dashed grey line shows the starting plan so you can see the difference. The dashed line across is your safety buffer: wherever the line dips below it, you would be cutting it too close. The red dot marks the lowest point.',
  },
  lockedWaterfall: {
    title: 'How to read this waterfall',
    text: 'Read it from left to right. Start with your balance today, add your income and take away your fixed costs: the light bar is what is left to plan with. Your variable costs and savings then come out of that, and the last bar is where you end. Bars with a lock are the locked layer.',
  },
  inOut: {
    title: 'How to read money in and out',
    text: 'Each period has two columns: on the left the money coming in, on the right what leaves your wallets, split into fixed costs, variable costs and savings. When the right column is taller than the left, you spend more than you receive in that period and your balance falls. The figure under each period is the balance it ends with.',
  },
  baskets: {
    title: 'How to read where the money goes',
    text: "Each bar is a basket's total for the period you chose, largest first. Baskets with a lock are fixed. When you change the plan, a thin black mark shows the starting amount and the figure beside the total shows the difference.",
  },
  compare: {
    title: 'How to read this comparison',
    text: 'For each measure, the top bar is the starting plan (your locked layer plus everything as first scheduled) and the bottom bar is your plan with your changes. The pill shows the difference: dark when the change helps, red when it makes things worse. Bars in red are below zero.',
  },
  plan: {
    title: 'How to adjust your plan',
    text: 'Each period starts with the balance carried over from the period before, adds what comes in, takes away what goes out, and ends with what is left. Items with a lock are your income and fixed costs: they keep their dates and cannot be moved or skipped. Everything else is yours to adjust: change its date, skip it, or put it off to "Not scheduled". The List view lets you type a date; the Board view lets you drag cards between periods.',
  },
  goals: {
    title: 'How to read the goals',
    text: 'Each bar is a savings goal. The solid part is what you have now, the lighter part is what your planned transfers will add by the deadline, and the black mark is the target. Move the slider to try a different monthly amount and see the result straight away.',
  },
  load: {
    title: 'How to read the daily load chart',
    text: 'Each column is one day. The grey part is meetings and fixed commitments; the coloured parts are planned task hours by project. The dashed line is how many hours you plan to work that day. A column above its line means that day is overloaded.',
  },
  hoursWaterfall: {
    title: 'How to read your hours',
    text: 'Start with the hours you plan to work. Recurring meetings (locked) come off first, leaving the hours available for tasks. The task hours due in this period then come off, and the last bar shows what is spare, or how short you are if it is below zero.',
  },
  byProject: {
    title: 'How to read hours by project',
    text: 'Each bar is the hours planned for one project in the period, largest first, with your recurring meetings (locked) for comparison.',
  },
  deadlines: {
    title: 'How to read the deadline check',
    text: 'Each task shows how many hours are planned before its deadline against the estimate. "On track" means enough hours are planned in time; "Short" means you need more hours before the deadline, either by working longer on an earlier day or by moving something else.',
  },
  board: {
    title: 'How to use the week board',
    text: 'Recurring meetings are locked: they keep their times and take their hours first. Drag a task from "To plan" onto a day, or pick a day from its menu. Use − and + on a chunk to change its hours, and − and + in a day’s header to change how long you work that day.',
  },
  priorities: {
    title: 'How to read the priorities',
    text: 'These are the month’s targets from the plan you are looking at: what comes in, what the locked layer takes, what goes to savings and the most to spend on variable costs. They change as you change the plan.',
  },
} as const;
