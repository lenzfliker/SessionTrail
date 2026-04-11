export const migration006ReminderSnoozeCount = `
ALTER TABLE reminder_prompts
ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0;
`;
