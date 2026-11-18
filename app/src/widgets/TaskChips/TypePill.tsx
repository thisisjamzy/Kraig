// Time v1.0's small labels, shared by the phone and web lines:
//   TypePill: a task type (Dreda v1.0 `Type pill`, BUILD-KIT section 4),
//     its icon and label on the type's label hue. Task rows, the Tasks
//     table, the tray and Planning settings use it.
//   HueTag: a project or area on its label hue (`Chip/Tag` 52348).
// The kit names widgets/TaskDb for TypePill; it lives here because the
// phone line may not import TaskDb (eslint.config.mjs, UI-PLATFORM-RULES).

import type { ReactNode } from 'react';
import { CalendarDays, Check, CircleDot, Mail, MapPin, Phone, Repeat2, Sparkle, Tag, Users, type LucideIcon } from 'lucide-react';
import { hueVars, type LabelHue } from '@/src/viewmodels/projects';
import { typeLook, type TypeLook } from '@/src/viewmodels/taskTypes';
import styles from './TaskChips.module.css';

const ICONS: Record<TypeLook['icon'], LucideIcon> = {
  todo: Check,
  meeting: Users,
  event: CalendarDays,
  email: Mail,
  call: Phone,
  followUp: Repeat2,
  walkIn: MapPin,
  deepWork: CircleDot,
  planning: Sparkle,
  custom: Tag,
};

export function TypePill({ type, size = 'md' }: { type: string | null | undefined; size?: 'sm' | 'md' }) {
  const look = typeLook(type);
  const Icon = ICONS[look.icon];
  const v = hueVars(look.hue);
  return (
    <span className={styles.pill} data-size={size} style={{ background: v.bg, color: v.fg }}>
      <Icon size={size === 'sm' ? 12 : 14} strokeWidth={2.25} aria-hidden />
      {look.label}
    </span>
  );
}

export function HueTag({ hue, children, title }: { hue: LabelHue; children: ReactNode; title?: string }) {
  const v = hueVars(hue);
  return (
    <span className={styles.tag} style={{ background: v.bg, color: v.fg }} title={title}>
      {children}
    </span>
  );
}
