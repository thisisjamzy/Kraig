// The Settings sections and their groups (pure, so the panel host can read
// them without loading the settings logic).

export type SettingsSection =
  | 'profile'
  | 'preferences'
  | 'notifications'
  | 'connections'
  | 'accounts'
  | 'budget'
  | 'work'
  | 'data'
  | 'about';

export const SETTINGS_GROUPS: { label: string; sections: { id: SettingsSection; label: string; description: string }[] }[] = [
  {
    label: 'Account',
    sections: [
      { id: 'profile', label: 'My profile', description: 'Your name, photo, email and how you sign in.' },
      { id: 'preferences', label: 'Preferences', description: 'Appearance, start page, dates, time zone and currency.' },
      { id: 'notifications', label: 'Notifications', description: 'What reaches you, and how.' },
      { id: 'connections', label: 'Connections', description: 'Google Calendar.' },
    ],
  },
  {
    label: 'Money',
    sections: [
      { id: 'accounts', label: 'Accounts and wallets', description: 'Your wallets, the default one, and savings the plan may use.' },
      { id: 'budget', label: 'Budget and forecast', description: 'Month start, safety cushion, savings target and defaults.' },
    ],
  },
  { label: 'Time', sections: [{ id: 'work', label: 'Work hours and tasks', description: 'Working hours, daily capacity and task defaults.' }] },
  { label: 'Data', sections: [{ id: 'data', label: 'Import and export', description: 'Spreadsheets in, CSV and JSON out, and data tools.' }] },
  { label: '', sections: [{ id: 'about', label: 'About', description: 'Version, terms, privacy and support.' }] },
];

export const SECTION_IDS = SETTINGS_GROUPS.flatMap((g) => g.sections.map((s) => s.id));

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return SECTION_IDS.includes(value as SettingsSection);
}

export function sectionInfo(id: SettingsSection) {
  return SETTINGS_GROUPS.flatMap((g) => g.sections).find((s) => s.id === id)!;
}
