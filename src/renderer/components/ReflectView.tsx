import { memo, useEffect, useMemo, useState } from "react";
import type {
  ReflectRangePreset,
  ReflectSessionDetail,
  ReflectSummary,
} from "../../shared/contracts";
import { ChevronLeftIcon, ChevronRightIcon, IconLabel, RotateCwIcon } from "./animated-icons";
import { formatDuration } from "../utils";

type ReflectViewProps = {
  summary: ReflectSummary | null;
  loading: boolean;
  busy: boolean;
  preset: ReflectRangePreset;
  periodOffset: number;
  dailyGoalMinutes: number;
  dashboardFullscreen: boolean;
  selectedSessionId: string | null;
  onPresetChange: (preset: ReflectRangePreset) => void;
  onPeriodOffsetChange: (offset: number) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
  onExportReport: () => void;
};

function formatLocalDateTime(value: string | null): string {
  if (!value) {
    return "In progress";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getSessionLabel(detail: ReflectSessionDetail): string {
  return `${formatLocalDateTime(detail.startedAt)} - ${formatDuration(detail.workedSeconds)}`;
}

function ReflectViewInner({
  summary,
  loading,
  busy,
  preset,
  periodOffset,
  dailyGoalMinutes,
  dashboardFullscreen,
  selectedSessionId,
  onPresetChange,
  onPeriodOffsetChange,
  onRefresh,
  onSelectSession,
  onExportReport,
}: ReflectViewProps) {
  const [sessionPage, setSessionPage] = useState(0);
  const reflectPageSize = 4;
  const dailyGoalSeconds = Math.max(60, dailyGoalMinutes * 60);

  useEffect(() => {
    setSessionPage(0);
  }, [preset, summary?.rangeStartedAt, summary?.rangeEndedAt]);

  const maxHeatmapSeconds = useMemo(
    () => Math.max(1, ...(summary?.rhythms.heatmap.map((cell) => cell.activeSeconds) ?? [0])),
    [summary?.rhythms.heatmap]
  );

  const heatmapByWeekday = useMemo(() => {
    const grouped = new Map<number, ReflectSummary["rhythms"]["heatmap"]>();
    for (const cell of summary?.rhythms.heatmap ?? []) {
      const existing = grouped.get(cell.weekday);
      if (existing) {
        existing.push(cell);
      } else {
        grouped.set(cell.weekday, [cell]);
      }
    }
    return grouped;
  }, [summary?.rhythms.heatmap]);

  const sessionCount = summary?.sessions.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(sessionCount / reflectPageSize));
  const clampedPage = Math.min(sessionPage, Math.max(0, pageCount - 1));

  useEffect(() => {
    if (clampedPage !== sessionPage) {
      setSessionPage(clampedPage);
    }
  }, [clampedPage, sessionPage]);

  const visibleSessions = useMemo(
    () =>
      (summary?.sessions ?? []).slice(
        clampedPage * reflectPageSize,
        clampedPage * reflectPageSize + reflectPageSize
      ),
    [clampedPage, reflectPageSize, summary?.sessions]
  );

  useEffect(() => {
    const firstVisibleSessionId = visibleSessions[0]?.sessionId ?? null;
    if (!firstVisibleSessionId) {
      return;
    }

    if (!selectedSessionId || !visibleSessions.some((session) => session.sessionId === selectedSessionId)) {
      onSelectSession(firstVisibleSessionId);
    }
  }, [onSelectSession, selectedSessionId, visibleSessions]);

  const selectedSession =
    visibleSessions.find((session) => session.sessionId === selectedSessionId) ??
    summary?.sessions.find((session) => session.sessionId === selectedSessionId) ??
    visibleSessions[0] ??
    summary?.sessions[0] ??
    null;

  return (
    <div className="reflect-view">
      <div className="panel__header">
        <div>
          <h2>Reflect</h2>
          <p>{summary ? summary.rangeLabel : "Local session analytics from tracked timing data."}</p>
        </div>
        <div className="reflect-toolbar">
          <div className="reflect-toolbar__group">
            <button
              type="button"
              className="button button--ghost reflect-toggle"
              disabled={busy}
              onClick={() => onPeriodOffsetChange(periodOffset - 1)}
            >
              <IconLabel
                icon={ChevronLeftIcon}
                label={preset === "this_month" ? "Previous month" : "Previous week"}
                size={14}
              />
            </button>
            <button
              type="button"
              className="button button--ghost reflect-toggle"
              disabled={busy || periodOffset === 0}
              onClick={() => onPeriodOffsetChange(Math.min(0, periodOffset + 1))}
            >
              <IconLabel
                icon={ChevronRightIcon}
                label={preset === "this_month" ? "Next month" : "Next week"}
                size={14}
              />
            </button>
          </div>
          <div className="reflect-toolbar__group">
            <button
              type="button"
              className={
                preset === "this_week"
                  ? "button button--ghost reflect-toggle reflect-toggle--active"
                  : "button button--ghost reflect-toggle"
              }
              onClick={() => onPresetChange("this_week")}
            >
              This Week
            </button>
            <button
              type="button"
              className={
                preset === "this_month"
                  ? "button button--ghost reflect-toggle reflect-toggle--active"
                  : "button button--ghost reflect-toggle"
              }
              onClick={() => onPresetChange("this_month")}
            >
              This Month
            </button>
          </div>
          <button
            type="button"
            className="button button--ghost reflect-toggle"
            disabled={busy || loading}
            onClick={onRefresh}
          >
            <IconLabel icon={RotateCwIcon} label="Refresh" size={14} />
          </button>
          <button
            type="button"
            className="button button--ghost reflect-toggle"
            disabled={busy}
            onClick={onExportReport}
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading && !summary ? <div className="empty-state">Loading reflect data...</div> : null}
      {!loading && summary && summary.sessions.length === 0 ? (
        <div className="empty-state">No tracked sessions started in this period yet.</div>
      ) : null}

      {summary ? (
        <>
          <div className="reflect-stat-grid">
            <div className="reflect-stat-card">
              <span>Sessions</span>
              <strong>{summary.overview.totalSessions}</strong>
            </div>
            <div className="reflect-stat-card">
              <span>Completed</span>
              <strong>{summary.overview.completedSessions}</strong>
            </div>
            <div className="reflect-stat-card">
              <span>Canceled</span>
              <strong>{summary.overview.canceledSessions}</strong>
            </div>
            <div className="reflect-stat-card">
              <span>Total worked</span>
              <strong>{formatDuration(summary.overview.totalWorkedSeconds)}</strong>
            </div>
            <div className="reflect-stat-card">
              <span>Median session</span>
              <strong>{formatDuration(summary.overview.medianWorkedSeconds)}</strong>
            </div>
          </div>

          <section className="panel reflect-panel reflect-panel--rhythms">
            <div className="reflect-rhythms-section">
              <div className="panel__header">
                <h2>Weekday Activity</h2>
                <span className="badge">Active work</span>
              </div>
              <div className="reflect-weekday-list">
                {summary.rhythms.weekdays.map((bucket) => {
                  const fillRatio = bucket.activeSeconds > 0 ? Math.min(bucket.activeSeconds / dailyGoalSeconds, 1) : 0;
                  const fillWidth =
                    fillRatio <= 0 ? "0%" : `${Math.max(fillRatio * 100, 0.5).toFixed(2)}%`;

                  return (
                    <div key={bucket.weekday} className="reflect-weekday-row">
                      <div className="reflect-weekday-row__meta">
                        <strong>{bucket.label}</strong>
                        <span>{bucket.sessionStarts} starts</span>
                      </div>
                      <div className="reflect-weekday-row__bar-shell">
                        <div className="reflect-weekday-row__bar" style={{ width: fillWidth }} />
                      </div>
                      <div className="reflect-weekday-row__value">
                        <strong>{formatDuration(bucket.activeSeconds)}</strong>
                        <span className="reflect-weekday-row__value-max">
                          / {formatDuration(dailyGoalSeconds)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="reflect-rhythms-divider" />

            <div className="reflect-rhythms-section reflect-rhythms-section--heatmap">
              <div className="panel__header">
                <h2>Active-Work Heatmap</h2>
                <span className="badge">Day x hour</span>
              </div>
              <div className="reflect-heatmap">
                <div className="reflect-heatmap__header">
                  <span />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      key={hour}
                      className={hour >= 8 && hour <= 17 ? "reflect-heatmap__hour--work" : undefined}
                    >
                      {hour.toString().padStart(2, "0")}
                    </span>
                  ))}
                </div>
                {summary.rhythms.weekdays.map((weekday) => (
                  <div key={weekday.weekday} className="reflect-heatmap__row">
                    <strong className="reflect-heatmap__row-label">{weekday.label}</strong>
                    {(heatmapByWeekday.get(weekday.weekday) ?? []).map((cell) => (
                      <div
                        key={`${cell.weekday}-${cell.hour}`}
                        className={
                          cell.activeSeconds > 0
                            ? "reflect-heatmap__cell"
                            : "reflect-heatmap__cell reflect-heatmap__cell--empty"
                        }
                        title={
                          cell.activeSeconds > 0
                            ? `${weekday.label} ${cell.hour.toString().padStart(2, "0")}:00 - ${formatDuration(cell.activeSeconds)}`
                            : undefined
                        }
                        style={{
                          opacity:
                            cell.activeSeconds > 0
                              ? 0.18 + (cell.activeSeconds / maxHeatmapSeconds) * 0.82
                              : undefined,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="reflect-grid reflect-grid--supporting">
            <section className="panel reflect-panel">
              <div className="panel__header">
                <h2>Fragmentation</h2>
                <span className="badge">{summary.fragmentation.totalPauseCount} pauses</span>
              </div>
              <div className="stats">
                <div>
                  <span>Pause rate</span>
                  <strong>{summary.fragmentation.pausesPerWorkedHour.toFixed(2)}/hr</strong>
                </div>
                <div>
                  <span>Median pause</span>
                  <strong>{formatDuration(summary.fragmentation.medianPauseSeconds)}</strong>
                </div>
                <div>
                  <span>Avg work stretch</span>
                  <strong>{formatDuration(summary.fragmentation.averageActiveBlockSeconds)}</strong>
                </div>
              </div>
            </section>

            <section className="panel reflect-panel">
              <div className="panel__header">
                <h2>Interruptions</h2>
                <span className="badge">{summary.interruptions.affectedSessionCount} sessions</span>
              </div>
              <div className="stats">
                <div>
                  <span>Suspend</span>
                  <strong>{summary.interruptions.suspendCount}</strong>
                </div>
                <div>
                  <span>App exit</span>
                  <strong>{summary.interruptions.appExitCount}</strong>
                </div>
                <div>
                  <span>Crash recovery</span>
                  <strong>{summary.interruptions.crashRecoveryCount}</strong>
                </div>
              </div>
            </section>

            <section className="panel reflect-panel">
              <div className="panel__header">
                <h2>Checkpoints</h2>
                <span className="badge">{summary.checkpoints.reminderTriggeredCount} prompts</span>
              </div>
              <div className="stats">
                <div>
                  <span>Snoozed</span>
                  <strong>{summary.checkpoints.reminderSnoozedCount}</strong>
                </div>
                <div>
                  <span>Skipped</span>
                  <strong>{summary.checkpoints.reminderSkippedCount}</strong>
                </div>
                <div>
                  <span>Captured</span>
                  <strong>{summary.checkpoints.reminderCapturedCount}</strong>
                </div>
                <div>
                  <span>Manual</span>
                  <strong>{summary.checkpoints.manualCheckpointCount}</strong>
                </div>
                <div>
                  <span>Completed</span>
                  <strong>{summary.checkpoints.completedCheckpointCount}</strong>
                </div>
                <div>
                  <span>Abandoned</span>
                  <strong>{summary.checkpoints.abandonedCheckpointCount}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className="reflect-grid reflect-grid--sessions">
            <section className="panel reflect-panel">
              <div className="panel__header">
                <h2>Sessions In Range</h2>
                <span className="badge">{summary.sessions.length}</span>
              </div>
              <div className="list">
                {visibleSessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    className={
                      selectedSession?.sessionId === session.sessionId ? "list-row list-row--active" : "list-row"
                    }
                    onClick={() => onSelectSession(session.sessionId)}
                  >
                    <span className="list-row__lead">
                      <span className="list-row__copy">
                        <strong className="list-row__title">{session.title}</strong>
                        <span className="list-row__subtitle">{getSessionLabel(session)}</span>
                      </span>
                    </span>
                    <span className={`list-row__status list-row__status--${session.status}`}>{session.status}</span>
                    <span className="list-row__trail">{formatDuration(session.workedSeconds)}</span>
                  </button>
                ))}
              </div>
              <div className="pagination-row">
                <span className="empty-state">
                  Page {clampedPage + 1} of {pageCount}
                </span>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy || clampedPage <= 0}
                    onClick={() => setSessionPage((current) => Math.max(0, current - 1))}
                  >
                    <IconLabel icon={ChevronLeftIcon} label="Previous" size={14} />
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy || clampedPage >= pageCount - 1}
                    onClick={() => setSessionPage((current) => Math.min(pageCount - 1, current + 1))}
                  >
                    <IconLabel icon={ChevronRightIcon} label="Next" size={14} />
                  </button>
                </div>
              </div>
            </section>

            <section className="panel reflect-panel">
              <div className="panel__header">
                <h2>Session Detail</h2>
                <span className="badge">{selectedSession?.status ?? "none"}</span>
              </div>
              {selectedSession ? (
                <>
                  <div className="stats">
                    <div>
                      <span>Started</span>
                      <strong>{formatLocalDateTime(selectedSession.startedAt)}</strong>
                    </div>
                    <div>
                      <span>Ended</span>
                      <strong>{formatLocalDateTime(selectedSession.endedAt)}</strong>
                    </div>
                    <div>
                      <span>Worked</span>
                      <strong>{formatDuration(selectedSession.workedSeconds)}</strong>
                    </div>
                    <div>
                      <span>Paused</span>
                      <strong>{formatDuration(selectedSession.pausedSeconds)}</strong>
                    </div>
                    <div>
                      <span>Pause count</span>
                      <strong>{selectedSession.pauseCount}</strong>
                    </div>
                    <div>
                      <span>Avg work stretch</span>
                      <strong>{formatDuration(selectedSession.averageActiveBlockSeconds)}</strong>
                    </div>
                    <div>
                      <span>Reminder prompts</span>
                      <strong>{selectedSession.reminderTriggeredCount}</strong>
                    </div>
                    <div>
                      <span>Manual checkpoints</span>
                      <strong>{selectedSession.manualCheckpointCount}</strong>
                    </div>
                    <div>
                      <span>Completed checkpoints</span>
                      <strong>{selectedSession.completedCheckpointCount}</strong>
                    </div>
                    <div>
                      <span>Abandoned checkpoints</span>
                      <strong>{selectedSession.abandonedCheckpointCount}</strong>
                    </div>
                  </div>
                  <div className="reflect-session-flags">
                    <span className="eyebrow">Interruption flags</span>
                    <div className="button-row reflect-session-flags__row">
                      {selectedSession.interruptionReasons.length > 0 ? (
                        selectedSession.interruptionReasons.map((reason) => (
                          <span key={reason} className="badge">
                            {reason}
                          </span>
                        ))
                      ) : (
                        <span className="empty-state">No interruption flags in this session.</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">Select a session to inspect its timing and interruption details.</div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

export const ReflectView = memo(ReflectViewInner);
