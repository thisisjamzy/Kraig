'use client';

// The Focus page's Eisenhower board — four quadrant columns (~80% of the
// screen each, snapping, the next one peeking in). Long-press a card and
// drag it onto another column to move it there; the hovered column gets a
// soft highlight. Only pending tasks appear.

import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus, Search } from 'lucide-react';
import { isQuadrant, type QuadrantMeta } from '@/src/viewmodels/eisenhower';
import type { FocusTask } from '@/src/logic/focus/useLogic';
import type { Quadrant } from '@/src/shared/firestore/types';
import { TaskCheckRow, type TaskCheckRowTask } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import styles from './FocusScreen.module.css';

/** The same checklist card the home, calendar and project pages use. */
function rowTask(task: FocusTask): TaskCheckRowTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    done: task.done,
    startTime: task.startTime,
    dueDate: task.dueDate,
    allDay: task.allDay,
    timeMode: task.timeMode,
    recurring: task.recurring,
    overdue: task.overdue,
  };
}

function KanbanCard({ task, suppressClick }: { task: FocusTask; suppressClick: () => boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className={styles.kCard}
      data-dragging={isDragging || undefined}
      // A drop isn't a tap — don't open the task or tick it off.
      onClickCapture={(event) => {
        if (suppressClick()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable task, long press to move"
    >
      <TaskCheckRow task={rowTask(task)} />
    </div>
  );
}

function Column({
  column,
  onAdd,
  suppressClick,
}: {
  column: QuadrantMeta & { tasks: FocusTask[] };
  onAdd: () => void;
  suppressClick: () => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={styles.column} data-quadrant={column.id} data-over={isOver || undefined}>
      <header className={styles.columnHead}>
        <div className={styles.columnText}>
          <h2 className={styles.columnTitle}>
            {column.label}
            <span className={styles.columnCount}>{column.tasks.length}</span>
          </h2>
          <p className={styles.columnHint}>{column.hint}</p>
        </div>
        <button type="button" className={styles.columnAdd} onClick={onAdd} aria-label={`New task in ${column.label}`}>
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </header>
      <div className={styles.columnCards}>
        {column.tasks.map((task) => (
          <KanbanCard key={task.id} task={task} suppressClick={suppressClick} />
        ))}
        {column.tasks.length === 0 && <p className={styles.columnEmpty}>Drop tasks here</p>}
      </div>
    </section>
  );
}

export function FocusKanban({
  columns,
  search,
  setSearch,
  onMove,
  onAdd,
  searchSlot,
}: {
  /** Wide screens: render the search here (the top bar) instead. */
  searchSlot?: (search: React.ReactNode) => React.ReactNode;
  columns: (QuadrantMeta & { tasks: FocusTask[] })[];
  search: string;
  setSearch: (value: string) => void;
  onMove: (id: string, quadrant: Quadrant) => void;
  onAdd: (quadrant: Quadrant) => void;
}) {
  // Long press to pick up, on touch and mouse alike; a quick tap still opens.
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  // dnd-kit lets the click through after a drop — swallow that one.
  const justDropped = useRef(false);
  const active = activeId ? columns.flatMap((c) => c.tasks).find((t) => t.id === activeId) ?? null : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
    }, 0);
    const target = event.over ? String(event.over.id) : null;
    if (isQuadrant(target)) onMove(String(event.active.id), target);
  }

  const searchField = (
    <label className={styles.search}>
      <Search size={18} strokeWidth={2} aria-hidden />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search task"
        aria-label="Search task"
      />
    </label>
  );

  return (
    <div className={styles.kanban}>
      {searchSlot ? searchSlot(searchField) : searchField}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className={styles.columns} data-hscroll="true">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              onAdd={() => onAdd(column.id)}
              suppressClick={() => justDropped.current}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }}>
          {active ? (
            <div className={`${styles.kCard} ${styles.kCardLifted}`}>
              <TaskCheckRow task={rowTask(active)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
