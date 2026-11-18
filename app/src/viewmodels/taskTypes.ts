// A task type as Time v1.0 draws it (TypePill, Planning settings): an icon
// and a label hue. `FirestoreTask.type` is a free string, so this reads any
// name: the three built-in presets (ToDo, Meeting, Event), the types the
// v1.0 frames show (Email, Call, Follow-up, Walk-in, Deep work, Planning),
// which a household can already add as custom types, and any other custom
// name, which reads grey. Adding the v1.0 names as presets is BUILD-KIT
// section 7.1 and waits for the owner. Pure, so it can be tested.

import type { LabelHue } from './projects';

export interface TypeLook {
  label: string;
  hue: LabelHue;
  icon: 'todo' | 'meeting' | 'event' | 'email' | 'call' | 'followUp' | 'walkIn' | 'deepWork' | 'planning' | 'custom';
}

const LOOKS: Record<string, TypeLook> = {
  todo: { label: 'To-do', hue: 'grey', icon: 'todo' },
  meeting: { label: 'Meeting', hue: 'rose', icon: 'meeting' },
  event: { label: 'Event', hue: 'teal', icon: 'event' },
  email: { label: 'Email', hue: 'blue', icon: 'email' },
  call: { label: 'Call', hue: 'green', icon: 'call' },
  followup: { label: 'Follow-up', hue: 'amber', icon: 'followUp' },
  walkin: { label: 'Walk-in', hue: 'orange', icon: 'walkIn' },
  deepwork: { label: 'Deep work', hue: 'purple', icon: 'deepWork' },
  planning: { label: 'Planning', hue: 'lime', icon: 'planning' },
};

function key(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/** How a task type looks, by its stored name ("ToDo", "Deep work", "DeepWork"). */
export function typeLook(name: string | null | undefined): TypeLook {
  if (!name) return LOOKS.todo;
  return LOOKS[key(name)] ?? { label: name, hue: 'grey', icon: 'custom' };
}
