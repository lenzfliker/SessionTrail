import type {
  ReflectCheckpointMetricsSummary,
  ReflectDayPartKey,
  ReflectDayPartSummary,
  ReflectFragmentationSummary,
  ReflectHeatmapCellSummary,
  ReflectHourSummary,
  ReflectInterruptionReason,
  ReflectInterruptionSummary,
  ReflectOverviewSummary,
  ReflectQuery,
  ReflectRangePreset,
  ReflectSessionDetail,
  ReflectSummary,
  ReflectWeekdaySummary,
  SessionStatus,
} from "../shared/contracts";
import type {
  CheckpointEntity,
  ReminderPromptEntity,
  SessionEntity,
  WorkSegmentEntity,
} from "./db/entities";

type ReflectAggregationInput = {
  sessions: SessionEntity[];
  workSegments: WorkSegmentEntity[];
  checkpoints: CheckpointEntity[];
  reminderPrompts: ReminderPromptEntity[];
};

type ReflectRange = {
  preset: ReflectRangePreset;
  label: string;
  startedAt: Date;
  endedAt: Date;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_PART_DEFS: Array<{ key: ReflectDayPartKey; label: string; startHour: number; endHour: number }> = [
  { key: "overnight", label: "Overnight", startHour: 0, endHour: 5 },
  { key: "morning", label: "Morning", startHour: 6, endHour: 11 },
  { key: "afternoon", label: "Afternoon", startHour: 12, endHour: 17 },
  { key: "evening", label: "Evening", startHour: 18, endHour: 23 },
];
const INTERRUPTION_REASONS = ["suspend", "app_exit", "crash_recovery"] as const;

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function roundSeconds(value: number): number {
  return Math.max(0, Math.round(value));
}

function diffSeconds(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / 1000);
}

function toMondayIndexedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function getDayPart(hour: number): ReflectDayPartKey {
  if (hour <= 5) {
    return "overnight";
  }
  if (hour <= 11) {
    return "morning";
  }
  if (hour <= 17) {
    return "afternoon";
  }
  return "evening";
}

function startOfLocalWeek(now: Date): Date {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - toMondayIndexedWeekday(next));
  return next;
}

function startOfLocalMonth(now: Date): Date {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setDate(1);
  return next;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middleIndex];
  }

  return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
}

function getRangeLabel(preset: ReflectRangePreset): string {
  return preset === "this_month" ? "This month" : "This week";
}

export function resolveReflectPreset(query?: ReflectQuery): ReflectRangePreset {
  return query?.preset === "this_month" ? "this_month" : "this_week";
}

export function resolveReflectRange(query?: ReflectQuery, now = new Date()): ReflectRange {
  const preset = resolveReflectPreset(query);
  return {
    preset,
    label: getRangeLabel(preset),
    startedAt: preset === "this_month" ? startOfLocalMonth(now) : startOfLocalWeek(now),
    endedAt: now,
  };
}

function createHourBuckets(): ReflectHourSummary[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    sessionStarts: 0,
  }));
}

function createWeekdayBuckets(): ReflectWeekdaySummary[] {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    sessionStarts: 0,
    activeSeconds: 0,
  }));
}

function createHeatmapBuckets(): ReflectHeatmapCellSummary[] {
  return WEEKDAY_LABELS.flatMap((weekdayLabel, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({
      weekday,
      weekdayLabel,
      hour,
      hourLabel: formatHourLabel(hour),
      activeSeconds: 0,
    }))
  );
}

function createDayPartBuckets(): ReflectDayPartSummary[] {
  return DAY_PART_DEFS.map(({ key, label }) => ({
    dayPart: key,
    label,
    activeSeconds: 0,
  }));
}

function getLiveWorkedSecondsForSession(session: SessionEntity, nowMs: number): number {
  if (session.status !== "active" || !session.lastHeartbeatAt) {
    return session.workedSeconds;
  }

  return session.workedSeconds + Math.max(0, Math.floor((nowMs - Date.parse(session.lastHeartbeatAt)) / 1000));
}

function getEffectiveSegmentEndMs(segment: WorkSegmentEntity, nowMs: number): number {
  return segment.endedAt ? Date.parse(segment.endedAt) : nowMs;
}

function getLiveWorkedSecondsForActiveSegment(
  session: SessionEntity,
  segment: WorkSegmentEntity,
  nowMs: number
): number {
  if (segment.type !== "active") {
    return segment.workedSeconds;
  }

  if (segment.endedAt || session.status !== "active" || !session.lastHeartbeatAt) {
    return segment.workedSeconds;
  }

  return segment.workedSeconds + Math.max(0, Math.floor((nowMs - Date.parse(session.lastHeartbeatAt)) / 1000));
}

function isCompletedStatus(status: SessionStatus): boolean {
  return status === "completed" || status === "exported";
}

function toInterruptionReason(reason: WorkSegmentEntity["closeReason"]): ReflectInterruptionReason | null {
  return INTERRUPTION_REASONS.includes(reason as ReflectInterruptionReason)
    ? (reason as ReflectInterruptionReason)
    : null;
}

function addSecondsToActiveRhythms(
  weekdayBuckets: ReflectWeekdaySummary[],
  heatmapBuckets: ReflectHeatmapCellSummary[],
  dayPartBuckets: ReflectDayPartSummary[],
  startedAtMs: number,
  endedAtMs: number,
  weightedWorkedSeconds: number
): void {
  if (endedAtMs <= startedAtMs || weightedWorkedSeconds <= 0) {
    return;
  }

  const wallDurationMs = endedAtMs - startedAtMs;
  let cursor = startedAtMs;
  while (cursor < endedAtMs) {
    const nextBoundary = new Date(cursor);
    nextBoundary.setMinutes(0, 0, 0);
    nextBoundary.setHours(nextBoundary.getHours() + 1);
    const sliceEndMs = Math.min(endedAtMs, nextBoundary.getTime());
    const sliceRatio = (sliceEndMs - cursor) / wallDurationMs;
    const sliceWorkedSeconds = weightedWorkedSeconds * sliceRatio;
    const sliceDate = new Date(cursor);
    const weekday = toMondayIndexedWeekday(sliceDate);
    const hour = sliceDate.getHours();
    const heatmapIndex = weekday * 24 + hour;
    const dayPart = getDayPart(hour);
    const dayPartIndex = DAY_PART_DEFS.findIndex((definition) => definition.key === dayPart);

    weekdayBuckets[weekday].activeSeconds += sliceWorkedSeconds;
    heatmapBuckets[heatmapIndex].activeSeconds += sliceWorkedSeconds;
    dayPartBuckets[dayPartIndex].activeSeconds += sliceWorkedSeconds;
    cursor = sliceEndMs;
  }
}

export function buildReflectSummary(
  input: ReflectAggregationInput,
  query?: ReflectQuery,
  now = new Date()
): ReflectSummary {
  const range = resolveReflectRange(query, now);
  const nowMs = now.getTime();
  const rangeStartMs = range.startedAt.getTime();
  const rangeEndMs = range.endedAt.getTime();

  const startHours = createHourBuckets();
  const weekdays = createWeekdayBuckets();
  const heatmap = createHeatmapBuckets();
  const dayParts = createDayPartBuckets();

  const workSegmentsBySession = new Map<string, WorkSegmentEntity[]>();
  for (const segment of input.workSegments) {
    const existing = workSegmentsBySession.get(segment.sessionId);
    if (existing) {
      existing.push(segment);
    } else {
      workSegmentsBySession.set(segment.sessionId, [segment]);
    }
  }

  const checkpointsBySession = new Map<string, CheckpointEntity[]>();
  for (const checkpoint of input.checkpoints) {
    const existing = checkpointsBySession.get(checkpoint.sessionId);
    if (existing) {
      existing.push(checkpoint);
    } else {
      checkpointsBySession.set(checkpoint.sessionId, [checkpoint]);
    }
  }

  const promptsBySession = new Map<string, ReminderPromptEntity[]>();
  for (const prompt of input.reminderPrompts) {
    const existing = promptsBySession.get(prompt.sessionId);
    if (existing) {
      existing.push(prompt);
    } else {
      promptsBySession.set(prompt.sessionId, [prompt]);
    }
  }

  const overviewWorked: number[] = [];
  const activeBlockDurations: number[] = [];
  const pauseDurations: number[] = [];
  let totalWorkedSeconds = 0;
  let completedSessions = 0;
  let canceledSessions = 0;
  let totalPauseCount = 0;
  let suspendCount = 0;
  let appExitCount = 0;
  let crashRecoveryCount = 0;
  const interruptionSessionIds = new Set<string>();

  const sessionDetails: ReflectSessionDetail[] = input.sessions
    .filter((session) => {
      if (!session.startedAt) {
        return false;
      }

      const startedAtMs = Date.parse(session.startedAt);
      return Number.isFinite(startedAtMs) && startedAtMs >= rangeStartMs && startedAtMs <= rangeEndMs;
    })
    .sort((a, b) => Date.parse(b.startedAt ?? b.createdAt) - Date.parse(a.startedAt ?? a.createdAt))
    .map((session) => {
      const liveWorkedSeconds = getLiveWorkedSecondsForSession(session, nowMs);
      overviewWorked.push(liveWorkedSeconds);
      totalWorkedSeconds += liveWorkedSeconds;
      if (isCompletedStatus(session.status)) {
        completedSessions += 1;
      }
      if (session.status === "canceled") {
        canceledSessions += 1;
      }

      if (session.startedAt) {
        const startedAt = new Date(session.startedAt);
        const weekday = toMondayIndexedWeekday(startedAt);
        weekdays[weekday].sessionStarts += 1;
        startHours[startedAt.getHours()].sessionStarts += 1;
      }

      const sessionSegments = [...(workSegmentsBySession.get(session.id) ?? [])].sort(
        (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt)
      );
      const sessionCheckpoints = checkpointsBySession.get(session.id) ?? [];
      const sessionPrompts = promptsBySession.get(session.id) ?? [];
      const interruptionReasons = new Set<ReflectInterruptionReason>();
      let pausedSeconds = 0;
      let pauseCount = 0;
      const sessionActiveDurations: number[] = [];

      for (const segment of sessionSegments) {
        const segmentStartMs = Date.parse(segment.startedAt);
        const segmentEndMs = getEffectiveSegmentEndMs(segment, nowMs);
        if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= segmentStartMs) {
          continue;
        }

        if (segment.type === "paused") {
          const pauseSeconds = diffSeconds(segmentStartMs, segmentEndMs);
          pausedSeconds += pauseSeconds;
          pauseCount += 1;
          totalPauseCount += 1;
          pauseDurations.push(pauseSeconds);
          continue;
        }

        const effectiveWorkedSeconds = getLiveWorkedSecondsForActiveSegment(session, segment, nowMs);
        if (effectiveWorkedSeconds > 0) {
          activeBlockDurations.push(effectiveWorkedSeconds);
          sessionActiveDurations.push(effectiveWorkedSeconds);
        }

        const clampedStartMs = Math.max(rangeStartMs, segmentStartMs);
        const clampedEndMs = Math.min(rangeEndMs, segmentEndMs);
        if (clampedEndMs > clampedStartMs && effectiveWorkedSeconds > 0) {
          const wallSeconds = diffSeconds(segmentStartMs, segmentEndMs);
          const weightedWorkedSeconds =
            wallSeconds > 0
              ? effectiveWorkedSeconds * (diffSeconds(clampedStartMs, clampedEndMs) / wallSeconds)
              : 0;
          addSecondsToActiveRhythms(
            weekdays,
            heatmap,
            dayParts,
            clampedStartMs,
            clampedEndMs,
            weightedWorkedSeconds
          );
        }

        const interruptionReason = toInterruptionReason(segment.closeReason);
        if (interruptionReason) {
          interruptionReasons.add(interruptionReason);
          interruptionSessionIds.add(session.id);
          if (interruptionReason === "suspend") {
            suspendCount += 1;
          } else if (interruptionReason === "app_exit") {
            appExitCount += 1;
          } else if (interruptionReason === "crash_recovery") {
            crashRecoveryCount += 1;
          }
        }
      }

      return {
        sessionId: session.id,
        title: session.title,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        workedSeconds: liveWorkedSeconds,
        pausedSeconds: roundSeconds(pausedSeconds),
        pauseCount,
        longestActiveBlockSeconds: roundSeconds(Math.max(0, ...sessionActiveDurations)),
        averageActiveBlockSeconds: roundSeconds(
          sessionActiveDurations.length > 0
            ? sessionActiveDurations.reduce((total, value) => total + value, 0) / sessionActiveDurations.length
            : 0
        ),
        interruptionReasons: [...interruptionReasons],
        reminderTriggeredCount: sessionPrompts.length,
        manualCheckpointCount: sessionCheckpoints.filter((checkpoint) => checkpoint.manualCheckpoint).length,
        completedCheckpointCount: sessionCheckpoints.filter((checkpoint) => checkpoint.status === "completed").length,
        abandonedCheckpointCount: sessionCheckpoints.filter((checkpoint) => checkpoint.status === "abandoned").length,
      };
    });

  const overview: ReflectOverviewSummary = {
    totalSessions: sessionDetails.length,
    completedSessions,
    canceledSessions,
    totalWorkedSeconds: roundSeconds(totalWorkedSeconds),
    medianWorkedSeconds: roundSeconds(median(overviewWorked)),
  };

  const selectedSessionIds = new Set(sessionDetails.map((session) => session.sessionId));
  const selectedPrompts = input.reminderPrompts.filter((prompt) => selectedSessionIds.has(prompt.sessionId));
  const selectedCheckpoints = input.checkpoints.filter((checkpoint) => selectedSessionIds.has(checkpoint.sessionId));

  const fragmentation: ReflectFragmentationSummary = {
    totalPauseCount,
    pausesPerWorkedHour:
      totalWorkedSeconds > 0 ? Number((totalPauseCount / (totalWorkedSeconds / 3600)).toFixed(2)) : 0,
    medianPauseSeconds: roundSeconds(median(pauseDurations)),
    longestActiveBlockSeconds: roundSeconds(Math.max(0, ...activeBlockDurations)),
    averageActiveBlockSeconds: roundSeconds(
      activeBlockDurations.length > 0
        ? activeBlockDurations.reduce((total, value) => total + value, 0) / activeBlockDurations.length
        : 0
    ),
  };

  const interruptions: ReflectInterruptionSummary = {
    suspendCount,
    appExitCount,
    crashRecoveryCount,
    affectedSessionCount: interruptionSessionIds.size,
  };

  const checkpoints: ReflectCheckpointMetricsSummary = {
    reminderTriggeredCount: selectedPrompts.length,
    reminderSnoozedCount: selectedPrompts.filter((prompt) => prompt.status === "snoozed").length,
    reminderSkippedCount: selectedPrompts.filter((prompt) => prompt.status === "skipped").length,
    reminderCapturedCount: selectedPrompts.filter((prompt) => prompt.status === "captured").length,
    manualCheckpointCount: selectedCheckpoints.filter((checkpoint) => checkpoint.manualCheckpoint).length,
    completedCheckpointCount: selectedCheckpoints.filter((checkpoint) => checkpoint.status === "completed").length,
    abandonedCheckpointCount: selectedCheckpoints.filter((checkpoint) => checkpoint.status === "abandoned").length,
  };

  return {
    preset: range.preset,
    rangeLabel: range.label,
    rangeStartedAt: range.startedAt.toISOString(),
    rangeEndedAt: range.endedAt.toISOString(),
    generatedAt: now.toISOString(),
    overview,
    rhythms: {
      startHours,
      weekdays: weekdays.map((weekday) => ({
        ...weekday,
        activeSeconds: roundSeconds(weekday.activeSeconds),
      })),
      heatmap: heatmap.map((cell) => ({
        ...cell,
        activeSeconds: roundSeconds(cell.activeSeconds),
      })),
      dayParts: dayParts.map((bucket) => ({
        ...bucket,
        activeSeconds: roundSeconds(bucket.activeSeconds),
      })),
    },
    fragmentation,
    interruptions,
    checkpoints,
    sessions: sessionDetails,
  };
}
