// "How to read this chart": one explanation per chart type, used by every
// card of that type (Remix/Dashboard/dashboards-redesign.md, section 6).
// It explains how to read the chart, never what the numbers mean: each
// card's insight line does that. UK English, no long dashes.

export type ChartType =
  | 'kpi'
  | 'splitBar'
  | 'column'
  | 'paired'
  | 'stacked'
  | 'line'
  | 'area'
  | 'bullet'
  | 'waterfall'
  | 'sankey'
  | 'treemap'
  | 'calendar'
  | 'heatmap'
  | 'boxplot'
  | 'bars'
  | 'debts'
  | 'donut'
  | 'radar'
  | 'gantt'
  | 'histogram'
  | 'dayTimeline'
  | 'transactions'
  | 'diverging'
  | 'reconciliation'
  | 'reconciliationLog'
  | 'rate'
  | 'walletBars';

export const GUIDE: Record<ChartType, { title: string; text: string }> = {
  kpi: {
    title: 'How to read these tiles',
    text: 'Each tile is one figure for the selected period. The coloured pill compares it with the previous period: one colour means the change is good for you, red means it needs attention and grey means no judgement. The thin bar shows progress towards a plan or target.',
  },
  splitBar: {
    title: 'How to read this card',
    text: 'The big number is the headline. The bar underneath is split into parts that add up to the whole; a longer part is a bigger share, and the legend gives the amount for each part.',
  },
  column: {
    title: 'How to read a column chart',
    text: 'Each bar is one period, from left to right. A taller bar means a larger amount: read the exact value above the bar, or against the scale on the left. The dashed line is a reference, such as an average, so you can see at a glance which bars sit above or below it.',
  },
  paired: {
    title: 'How to read paired columns',
    text: 'Each period has two bars side by side: money in on the left and money out on the right. When the left bar is taller, you kept money in that period. A striped part of the left bar is money you borrowed rather than earned. The figure under each period is in minus out.',
  },
  stacked: {
    title: 'How to read stacked columns',
    text: 'Each column is one period, split into coloured parts that add up to the total on top. Compare heights to see busier periods, and the size of each colour to see what the time went on. The dashed line is your target.',
  },
  line: {
    title: 'How to read a line chart',
    text: 'Each line joins values over time, from left to right. A line going up means the amount is growing; the steeper, the faster. The space between two lines is the gap between them. Dashed lines over the striped background are forecasts, not actual figures.',
  },
  area: {
    title: 'How to read a running total',
    text: 'The shaded shape is a running total that builds up over time. A steep rise means it grew quickly; a dip means money was taken out. The dashed line is your goal, and the gap to it is what is left to reach.',
  },
  bullet: {
    title: 'How to read a bullet chart',
    text: 'Each row compares what happened with what was planned. The coloured bar is the actual amount and the short black line is the plan. If the bar passes the line you went over plan, and the bar changes colour.',
  },
  waterfall: {
    title: 'How to read a waterfall',
    text: 'Read from top to bottom. The first bar is where you started and the last is where you ended. Each bar in between starts where the previous one finished and moves the total right (money in) or left (money out).',
  },
  sankey: {
    title: 'How to read a flow diagram',
    text: 'Money flows from the sources on the left to where it went on the right. The thicker a band, the more money it carries. Follow a band across to see what each source paid for.',
  },
  treemap: {
    title: 'How to read a treemap',
    text: 'Each rectangle is one category, and its size is its share of the total. The biggest rectangles are where most of it went. Each label gives the amount and its percentage.',
  },
  calendar: {
    title: 'How to read a calendar heat map',
    text: 'Each square is one day, laid out like a calendar. Darker squares had more, and light grey squares had none. Squares with a dashed outline are still to come. Look for patterns, such as weekends that are always darker.',
  },
  heatmap: {
    title: 'How to read a heat map',
    text: 'Each square is one combination of a row and a column, such as an hour and a day of the week. Darker squares have more. Read along a row to see one row’s pattern, or down a column to compare the same column across rows.',
  },
  boxplot: {
    title: 'How to read a box plot',
    text: 'Each box sums up many values, such as every month in a year. The thick line inside the box is the typical value (the median). The box covers the middle half of all values, and the thin lines reach the lowest and highest. A taller box means the values varied more.',
  },
  bars: {
    title: 'How to read a bar chart',
    text: 'Each bar is one item, sorted from largest to smallest. A longer bar means a bigger amount; the exact figure is on the right.',
  },
  debts: {
    title: 'How to read these bars',
    text: 'Each bar is one debt. The coloured part is what you have paid and the grey part is what is left. The line underneath gives the monthly payment and when it will be cleared.',
  },
  donut: {
    title: 'How to read a donut chart',
    text: 'The ring is the whole, split into coloured parts. A bigger part is a bigger share. The list underneath gives the exact amount and percentage for each part.',
  },
  radar: {
    title: 'How to read a radar chart',
    text: 'Each spoke is one area of life. The dashed shape is your target and the shaded shape is what actually happened. Where the shaded shape falls inside the dashed one, you are short of target in that area.',
  },
  gantt: {
    title: 'How to read a project timeline',
    text: 'Each row is a project on a calendar running left to right. The bar starts on the start date and ends on the due date. The darker part shows how much is done, and the black line marks today.',
  },
  histogram: {
    title: 'How to read a histogram',
    text: 'The bars sort values into ranges, shown along the bottom. A taller bar means more items fell into that range, so the tallest bar is the most typical range.',
  },
  dayTimeline: {
    title: 'How to read a day timeline',
    text: 'Time runs from top to bottom, one hour per line. Each coloured block is a stretch of tracked time, coloured by type of work. Gaps are untracked time, dashed blocks are planned for later, and the red line is now.',
  },
  transactions: {
    title: 'How to read this list',
    text: 'Every entry recorded today, oldest first. Unplanned entries are marked so you can spot them quickly.',
  },
  diverging: {
    title: 'How to read above and below zero',
    text: 'The middle line is zero. Bars below it are money that went missing: your wallets held less than your records said. Bars above it are money you found: more than your records said. Shorter bars are better in both directions.',
  },
  reconciliation: {
    title: 'How to read a reconciliation check',
    text: 'Each row is one wallet. Recorded is what your entries say should be there; counted is what you actually found when you checked. The difference is money that was never recorded. Checks more than a week old are flagged so you know which wallet to count next.',
  },
  reconciliationLog: {
    title: 'How to read the reconciliation log',
    text: 'Every time you counted a wallet, newest last. The difference column shows what was missing or found at that check, and the days column shows how long it had been since the previous check of that wallet.',
  },
  rate: {
    title: 'How to read this line',
    text: 'The line shows untracked money as a share of everything you spent, period by period. Lower is better. The dashed line is your target: points above it mean too much money is slipping through without a record.',
  },
  walletBars: {
    title: 'How to read this bar chart',
    text: 'Each bar is one wallet, sorted from the most untracked money to the least. A longer bar means more money went missing from that wallet; the right column gives the amount and its share of all untracked money.',
  },
};

/** Added to a guide while its chart is on a log scale. */
export const LOG_GUIDE = 'On a log scale each step up the scale is ten times the one before, so small and large values both stay readable. Equal gaps mean equal ratios, not equal amounts.';
