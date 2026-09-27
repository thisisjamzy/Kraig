// A day timeline's layout — pure, so it's computed once per day / change of
// activities and can be tested. Activities that overlap in time
// (A.start < B.end && B.start < A.end — touching times don't) are chained
// into overlap groups; inside a group each activity takes the first column
// whose last activity has already ended (in start order, so the earliest
// land on the left), or opens a new one. Blocked activities can't overlap
// anything, so they always end up alone in a one-column group.

export interface DayActivity {
  id: string;
  startMin: number; // minutes from midnight
  endMin: number;
}

export interface ActivityLayout {
  groupId: string;
  column: number;
  columnCount: number;
  /** Pixels from the top of the timeline (its first hour). */
  top: number;
  height: number;
}

export interface OverlapGroup {
  id: string;
  startMin: number;
  endMin: number;
  columnCount: number;
  /** Its activities in start-time order (reading order too). */
  itemIds: string[];
  top: number;
  height: number;
}

export interface DayLayout {
  byId: Map<string, ActivityLayout>;
  groups: OverlapGroup[];
}

export function overlaps(a: DayActivity, b: DayActivity): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function layoutDay(activities: DayActivity[], firstHour: number, hourHeight: number): DayLayout {
  const px = (min: number) => ((min - firstHour * 60) / 60) * hourHeight;
  const sorted = [...activities].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  const byId = new Map<string, ActivityLayout>();
  const groups: OverlapGroup[] = [];

  let members: { item: DayActivity; column: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  function close() {
    if (!members.length) return;
    const id = `g${groups.length}`;
    const startMin = members[0].item.startMin;
    const columnCount = columnEnds.length;
    for (const { item, column } of members) {
      byId.set(item.id, { groupId: id, column, columnCount, top: px(item.startMin), height: px(item.endMin) - px(item.startMin) });
    }
    groups.push({
      id,
      startMin,
      endMin: groupEnd,
      columnCount,
      itemIds: members.map((m) => m.item.id),
      top: px(startMin),
      height: px(groupEnd) - px(startMin),
    });
    members = [];
    columnEnds = [];
    groupEnd = -Infinity;
  }

  for (const item of sorted) {
    // Starts at or after everything in the group has ended: a new group.
    if (members.length && item.startMin >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= item.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[column] = item.endMin;
    }
    members.push({ item, column });
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  close();
  return { byId, groups };
}

/** How much a card can show at its height (see DayTimeline). */
export type CardDensity = 'line' | 'short' | 'full';

export function densityFor(minutes: number): CardDensity {
  if (minutes < 30) return 'line';
  if (minutes < 60) return 'short';
  return 'full';
}
