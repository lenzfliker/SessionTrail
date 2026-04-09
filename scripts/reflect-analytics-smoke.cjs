const assert = require("node:assert/strict");

function localIso(year, month, day, hour, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second, 0).toISOString();
}

function mondayIndex(value) {
  return (value.getDay() + 6) % 7;
}

async function main() {
  const { buildReflectSummary } = require("../dist/main/reflect-analytics.js");

  const now = new Date(2026, 3, 9, 12, 0, 0, 0);

  const sessions = [
    {
      id: "session-week-complete",
      title: "Week Complete",
      targetWorkSeconds: 7200,
      workedSeconds: 3600,
      status: "completed",
      reminderIntervalMinutes: 10,
      screenshotMode: "full_desktop",
      allowOvertime: true,
      overtimeStartedAt: null,
      startedAt: localIso(2026, 4, 7, 9, 0),
      endedAt: localIso(2026, 4, 7, 10, 30),
      lastHeartbeatAt: localIso(2026, 4, 7, 10, 30),
      createdAt: localIso(2026, 4, 7, 9, 0),
      updatedAt: localIso(2026, 4, 7, 10, 30),
    },
    {
      id: "session-week-paused",
      title: "Week Paused",
      targetWorkSeconds: 7200,
      workedSeconds: 1200,
      status: "paused",
      reminderIntervalMinutes: 10,
      screenshotMode: "full_desktop",
      allowOvertime: true,
      overtimeStartedAt: null,
      startedAt: localIso(2026, 4, 9, 6, 0),
      endedAt: null,
      lastHeartbeatAt: localIso(2026, 4, 9, 6, 20),
      createdAt: localIso(2026, 4, 9, 6, 0),
      updatedAt: localIso(2026, 4, 9, 6, 20),
    },
    {
      id: "session-week-active",
      title: "Week Active",
      targetWorkSeconds: 7200,
      workedSeconds: 3000,
      status: "active",
      reminderIntervalMinutes: 10,
      screenshotMode: "full_desktop",
      allowOvertime: true,
      overtimeStartedAt: null,
      startedAt: localIso(2026, 4, 9, 11, 0),
      endedAt: null,
      lastHeartbeatAt: localIso(2026, 4, 9, 11, 50),
      createdAt: localIso(2026, 4, 9, 11, 0),
      updatedAt: localIso(2026, 4, 9, 11, 50),
    },
    {
      id: "session-month-midnight",
      title: "Month Midnight",
      targetWorkSeconds: 7200,
      workedSeconds: 2400,
      status: "completed",
      reminderIntervalMinutes: 10,
      screenshotMode: "full_desktop",
      allowOvertime: true,
      overtimeStartedAt: null,
      startedAt: localIso(2026, 4, 1, 23, 30),
      endedAt: localIso(2026, 4, 2, 0, 30),
      lastHeartbeatAt: localIso(2026, 4, 2, 0, 30),
      createdAt: localIso(2026, 4, 1, 23, 30),
      updatedAt: localIso(2026, 4, 2, 0, 30),
    },
  ];

  const workSegments = [
    {
      id: "segment-1a",
      sessionId: "session-week-complete",
      type: "active",
      startedAt: localIso(2026, 4, 7, 9, 0),
      endedAt: localIso(2026, 4, 7, 9, 30),
      workedSeconds: 1800,
      closeReason: "pause",
      createdAt: localIso(2026, 4, 7, 9, 0),
    },
    {
      id: "segment-1p",
      sessionId: "session-week-complete",
      type: "paused",
      startedAt: localIso(2026, 4, 7, 9, 30),
      endedAt: localIso(2026, 4, 7, 10, 0),
      workedSeconds: 0,
      closeReason: null,
      createdAt: localIso(2026, 4, 7, 9, 30),
    },
    {
      id: "segment-1b",
      sessionId: "session-week-complete",
      type: "active",
      startedAt: localIso(2026, 4, 7, 10, 0),
      endedAt: localIso(2026, 4, 7, 10, 30),
      workedSeconds: 1800,
      closeReason: "suspend",
      createdAt: localIso(2026, 4, 7, 10, 0),
    },
    {
      id: "segment-2a",
      sessionId: "session-week-paused",
      type: "active",
      startedAt: localIso(2026, 4, 9, 6, 0),
      endedAt: localIso(2026, 4, 9, 6, 20),
      workedSeconds: 1200,
      closeReason: "app_exit",
      createdAt: localIso(2026, 4, 9, 6, 0),
    },
    {
      id: "segment-2p",
      sessionId: "session-week-paused",
      type: "paused",
      startedAt: localIso(2026, 4, 9, 6, 20),
      endedAt: null,
      workedSeconds: 0,
      closeReason: null,
      createdAt: localIso(2026, 4, 9, 6, 20),
    },
    {
      id: "segment-3a",
      sessionId: "session-week-active",
      type: "active",
      startedAt: localIso(2026, 4, 9, 11, 0),
      endedAt: null,
      workedSeconds: 3000,
      closeReason: null,
      createdAt: localIso(2026, 4, 9, 11, 0),
    },
    {
      id: "segment-4a",
      sessionId: "session-month-midnight",
      type: "active",
      startedAt: localIso(2026, 4, 1, 23, 30),
      endedAt: localIso(2026, 4, 1, 23, 50),
      workedSeconds: 1200,
      closeReason: "crash_recovery",
      createdAt: localIso(2026, 4, 1, 23, 30),
    },
    {
      id: "segment-4p",
      sessionId: "session-month-midnight",
      type: "paused",
      startedAt: localIso(2026, 4, 1, 23, 50),
      endedAt: localIso(2026, 4, 2, 0, 10),
      workedSeconds: 0,
      closeReason: null,
      createdAt: localIso(2026, 4, 1, 23, 50),
    },
    {
      id: "segment-4b",
      sessionId: "session-month-midnight",
      type: "active",
      startedAt: localIso(2026, 4, 2, 0, 10),
      endedAt: localIso(2026, 4, 2, 0, 30),
      workedSeconds: 1200,
      closeReason: "complete",
      createdAt: localIso(2026, 4, 2, 0, 10),
    },
  ];

  const checkpoints = [
    {
      id: "checkpoint-1",
      sessionId: "session-week-complete",
      occurredAt: localIso(2026, 4, 7, 9, 15),
      workedOffsetSeconds: 900,
      status: "completed",
      noteText: "redacted",
      reminderTriggered: true,
      manualCheckpoint: false,
      createdAt: localIso(2026, 4, 7, 9, 15),
      updatedAt: localIso(2026, 4, 7, 9, 15),
    },
    {
      id: "checkpoint-2",
      sessionId: "session-week-complete",
      occurredAt: localIso(2026, 4, 7, 10, 10),
      workedOffsetSeconds: 2400,
      status: "completed",
      noteText: "redacted",
      reminderTriggered: false,
      manualCheckpoint: true,
      createdAt: localIso(2026, 4, 7, 10, 10),
      updatedAt: localIso(2026, 4, 7, 10, 10),
    },
    {
      id: "checkpoint-3",
      sessionId: "session-week-paused",
      occurredAt: localIso(2026, 4, 9, 6, 18),
      workedOffsetSeconds: 1080,
      status: "abandoned",
      noteText: null,
      reminderTriggered: true,
      manualCheckpoint: false,
      createdAt: localIso(2026, 4, 9, 6, 18),
      updatedAt: localIso(2026, 4, 9, 6, 18),
    },
    {
      id: "checkpoint-4",
      sessionId: "session-month-midnight",
      occurredAt: localIso(2026, 4, 2, 0, 12),
      workedOffsetSeconds: 1500,
      status: "completed",
      noteText: "redacted",
      reminderTriggered: true,
      manualCheckpoint: false,
      createdAt: localIso(2026, 4, 2, 0, 12),
      updatedAt: localIso(2026, 4, 2, 0, 12),
    },
  ];

  const reminderPrompts = [
    {
      id: "prompt-1",
      sessionId: "session-week-complete",
      workedOffsetSeconds: 900,
      status: "captured",
      snoozedUntil: null,
      createdAt: localIso(2026, 4, 7, 9, 14),
      updatedAt: localIso(2026, 4, 7, 9, 15),
      resolvedAt: localIso(2026, 4, 7, 9, 15),
    },
    {
      id: "prompt-2",
      sessionId: "session-week-paused",
      workedOffsetSeconds: 1080,
      status: "snoozed",
      snoozedUntil: localIso(2026, 4, 9, 6, 25),
      createdAt: localIso(2026, 4, 9, 6, 18),
      updatedAt: localIso(2026, 4, 9, 6, 19),
      resolvedAt: null,
    },
    {
      id: "prompt-3",
      sessionId: "session-month-midnight",
      workedOffsetSeconds: 1500,
      status: "skipped",
      snoozedUntil: null,
      createdAt: localIso(2026, 4, 2, 0, 12),
      updatedAt: localIso(2026, 4, 2, 0, 12),
      resolvedAt: localIso(2026, 4, 2, 0, 12),
    },
  ];

  const weekSummary = buildReflectSummary(
    { sessions, workSegments, checkpoints, reminderPrompts },
    { preset: "this_week" },
    now
  );
  const monthSummary = buildReflectSummary(
    { sessions, workSegments, checkpoints, reminderPrompts },
    { preset: "this_month" },
    now
  );

  assert.equal(weekSummary.overview.totalSessions, 3, "This week should include only week-started sessions.");
  assert.equal(monthSummary.overview.totalSessions, 4, "This month should include the earlier month session too.");
  assert.equal(weekSummary.overview.completedSessions, 1, "Only one week session is completed/exported.");
  assert.equal(monthSummary.overview.completedSessions, 2, "Two month sessions are completed/exported.");

  const weekStartHours = new Map(weekSummary.rhythms.startHours.map((bucket) => [bucket.hour, bucket.sessionStarts]));
  assert.equal(weekStartHours.get(9), 1, "Week histogram should count the 09:00 start.");
  assert.equal(weekStartHours.get(6), 1, "Week histogram should count the 06:00 start.");
  assert.equal(weekStartHours.get(11), 1, "Week histogram should count the 11:00 start.");

  const midnightStartHour = new Date(sessions[3].startedAt).getHours();
  const monthStartHours = new Map(monthSummary.rhythms.startHours.map((bucket) => [bucket.hour, bucket.sessionStarts]));
  assert.equal(monthStartHours.get(midnightStartHour), 1, "Month histogram should include the late-night start.");

  const weekCompleteWeekday = mondayIndex(new Date(sessions[0].startedAt));
  const weekdayBucket = weekSummary.rhythms.weekdays.find((bucket) => bucket.weekday === weekCompleteWeekday);
  assert.ok(weekdayBucket, "Weekday bucket should exist.");
  assert.equal(weekdayBucket.sessionStarts >= 1, true, "Weekday bucket should count the session start.");

  const overnightBucket = monthSummary.rhythms.dayParts.find((bucket) => bucket.dayPart === "overnight");
  assert.ok(overnightBucket, "Overnight bucket should exist.");
  assert.equal(overnightBucket.activeSeconds > 0, true, "Overnight bucket should capture the post-midnight active block.");

  const midnightHeatCell = monthSummary.rhythms.heatmap.find((cell) => {
    const midnightDate = new Date(localIso(2026, 4, 2, 0, 10));
    return cell.weekday === mondayIndex(midnightDate) && cell.hour === midnightDate.getHours();
  });
  assert.ok(midnightHeatCell, "Heatmap cell should exist for the post-midnight hour.");
  assert.equal(midnightHeatCell.activeSeconds > 0, true, "Heatmap should record post-midnight active work.");

  assert.equal(weekSummary.fragmentation.totalPauseCount, 2, "Week pause count should include paused segments.");
  assert.equal(weekSummary.fragmentation.longestActiveBlockSeconds, 3600, "Open active sessions should use live worked time.");
  assert.equal(weekSummary.fragmentation.averageActiveBlockSeconds > 0, true, "Average active block should be derived.");

  assert.equal(weekSummary.interruptions.suspendCount, 1, "Week interruptions should count suspend.");
  assert.equal(weekSummary.interruptions.appExitCount, 1, "Week interruptions should count app_exit.");
  assert.equal(weekSummary.interruptions.crashRecoveryCount, 0, "Week interruptions should exclude older crash recovery.");
  assert.equal(monthSummary.interruptions.crashRecoveryCount, 1, "Month interruptions should include crash recovery.");

  assert.equal(weekSummary.checkpoints.reminderTriggeredCount, 2, "Week prompts should count triggered reminders.");
  assert.equal(weekSummary.checkpoints.reminderSnoozedCount, 1, "Week prompts should count snoozed reminders.");
  assert.equal(weekSummary.checkpoints.reminderCapturedCount, 1, "Week prompts should count captured reminders.");
  assert.equal(weekSummary.checkpoints.manualCheckpointCount, 1, "Week checkpoints should count manual captures.");
  assert.equal(weekSummary.checkpoints.abandonedCheckpointCount, 1, "Week checkpoints should count abandoned shells.");
  assert.equal(monthSummary.checkpoints.reminderSkippedCount, 1, "Month prompts should count skipped reminders.");

  const activeSessionDetail = weekSummary.sessions.find((session) => session.sessionId === "session-week-active");
  assert.ok(activeSessionDetail, "Open active session should appear in detail list.");
  assert.equal(activeSessionDetail.workedSeconds, 3600, "Open active session detail should use live worked time.");

  assert.equal("noteText" in activeSessionDetail, false, "Reflect detail must not expose note contents.");
  assert.equal("screenshot" in activeSessionDetail, false, "Reflect detail must not expose screenshot data.");
  assert.equal("composition" in weekSummary, false, "Reflect summary must not expose export composition data.");

  console.log("Reflect analytics smoke passed.", {
    weekSessions: weekSummary.overview.totalSessions,
    monthSessions: monthSummary.overview.totalSessions,
    weekLongestBlock: weekSummary.fragmentation.longestActiveBlockSeconds,
  });
}

main().catch((error) => {
  console.error("Reflect analytics smoke failed.", error);
  process.exit(1);
});
