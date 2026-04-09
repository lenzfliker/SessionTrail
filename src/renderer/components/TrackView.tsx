import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type {
  SessionHistoryPage,
  SessionHistoryStatusFilter,
  SessionSummary
} from "../../shared/contracts";
import {
  BadgeAlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  GalleryIcon,
  IconGlyph,
  IconLabel,
  MonitorCheckIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon
} from "./animated-icons";
import { STAGGER_ITEM_VARIANTS, STAGGER_VARIANTS } from "../motion";
import { formatDuration } from "../utils";

type TrackViewProps = {
  activeSession: SessionSummary | null;
  workedSeconds: number;
  sessionTitle: string;
  selectedSessionId: string | null;
  pendingRecovery: boolean;
  busy: boolean;
  controlsBlocked: boolean;
  motionEnabled: boolean;
  historyQuery: string;
  historyStatus: SessionHistoryStatusFilter;
  historyPage: SessionHistoryPage;
  onSessionTitleChange: (value: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onSelectSession: (sessionId: string) => void;
  onRenameHistorySession: (sessionId: string, title: string) => void;
  onDeleteHistorySession: (sessionId: string) => void;
  onHistoryQueryChange: (value: string) => void;
  onHistoryStatusChange: (value: SessionHistoryStatusFilter) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

const HISTORY_STATUS_OPTIONS: SessionHistoryStatusFilter[] = [
  "all",
  "active",
  "paused",
  "completed",
  "canceled",
  "exported",
  "draft",
  "crashed"
];

function getSessionStatusIcon(status: SessionSummary["status"] | "idle") {
  switch (status) {
    case "active":
      return PlayIcon;
    case "paused":
      return PauseIcon;
    case "completed":
      return CheckIcon;
    case "canceled":
      return TrashIcon;
    case "exported":
      return MonitorCheckIcon;
    case "draft":
      return GalleryIcon;
    case "crashed":
      return BadgeAlertIcon;
    case "idle":
    default:
      return ClockIcon;
  }
}

export function TrackView({
  activeSession,
  workedSeconds,
  sessionTitle,
  selectedSessionId,
  pendingRecovery,
  busy,
  controlsBlocked,
  motionEnabled,
  historyQuery,
  historyStatus,
  historyPage,
  onSessionTitleChange,
  onStart,
  onPause,
  onResume,
  onComplete,
  onCancel,
  onSelectSession,
  onRenameHistorySession,
  onDeleteHistorySession,
  onHistoryQueryChange,
  onHistoryStatusChange,
  onPreviousPage,
  onNextPage
}: TrackViewProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const pageNumber = Math.floor(historyPage.offset / historyPage.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(historyPage.total / historyPage.limit));
  const pauseDisabled = !activeSession || activeSession.status !== "active" || controlsBlocked || busy;
  const resumeDisabled = !activeSession || activeSession.status !== "paused" || controlsBlocked || busy;
  const completeDisabled = !activeSession || controlsBlocked || busy;
  const cancelDisabled = !activeSession || controlsBlocked || busy;
  const ActiveSessionStatusIcon = getSessionStatusIcon(activeSession?.status ?? "idle");

  useEffect(() => {
    if (editingSessionId && !historyPage.items.some((session) => session.id === editingSessionId)) {
      setEditingSessionId(null);
      setEditingTitle("");
    }

    if (confirmDeleteSessionId && !historyPage.items.some((session) => session.id === confirmDeleteSessionId)) {
      setConfirmDeleteSessionId(null);
    }
  }, [confirmDeleteSessionId, editingSessionId, historyPage.items]);

  const beginEditSession = (session: SessionSummary) => {
    setConfirmDeleteSessionId((current) => (current === session.id ? null : current));
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const requestDeleteSession = (sessionId: string) => {
    cancelEditSession();
    setConfirmDeleteSessionId((current) => (current === sessionId ? null : sessionId));
  };

  return (
    <>
      <div className="panel__header">
        <h2>Session</h2>
        <span className="badge">
          <IconLabel icon={ActiveSessionStatusIcon} label={activeSession?.status ?? "idle"} size={14} />
        </span>
      </div>
      {activeSession ? (
        <>
          <motion.div
            className="stats"
            initial={motionEnabled ? "hidden" : false}
            animate="visible"
            variants={STAGGER_VARIANTS}
          >
            <motion.div variants={STAGGER_ITEM_VARIANTS}><span>Title</span><strong>{activeSession.title}</strong></motion.div>
            <motion.div variants={STAGGER_ITEM_VARIANTS}><span>Worked</span><strong>{formatDuration(workedSeconds)}</strong></motion.div>
            <motion.div variants={STAGGER_ITEM_VARIANTS}><span>Target</span><strong>{formatDuration(activeSession.targetWorkSeconds)}</strong></motion.div>
            <motion.div variants={STAGGER_ITEM_VARIANTS}><span>Reminder</span><strong>{activeSession.reminderIntervalMinutes} min</strong></motion.div>
          </motion.div>
          <motion.div
            className="button-row"
            initial={motionEnabled ? "hidden" : false}
            animate="visible"
            variants={STAGGER_VARIANTS}
          >
            <motion.button type="button" className={pauseDisabled ? "button button--inactive" : "button"} disabled={pauseDisabled} onClick={onPause} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={PauseIcon} label="Pause" /></motion.button>
            <motion.button type="button" className={resumeDisabled ? "button button--inactive" : "button"} disabled={resumeDisabled} onClick={onResume} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={PlayIcon} label="Resume" /></motion.button>
            <motion.button type="button" className={completeDisabled ? "button button--inactive" : "button"} disabled={completeDisabled} onClick={onComplete} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={CheckIcon} label="Complete" /></motion.button>
            <motion.button type="button" className={cancelDisabled ? "button button--inactive" : "button button--danger"} disabled={cancelDisabled} onClick={onCancel} variants={STAGGER_ITEM_VARIANTS}><IconLabel icon={TrashIcon} label="Cancel" /></motion.button>
          </motion.div>
        </>
      ) : (
        <>
          <label className="field">
            <span>Session title</span>
            <input
              value={sessionTitle}
              onChange={(event) => onSessionTitleChange(event.target.value)}
              placeholder="Focus session"
            />
          </label>
          <div className="button-row">
            <button type="button" className="button" disabled={busy || pendingRecovery} onClick={onStart}>
              <IconLabel icon={PlayIcon} label="Start session" />
            </button>
          </div>
        </>
      )}

      <div className="panel__header panel__header--space">
        <h2>Session history</h2>
        <span className="badge">{historyPage.total}</span>
      </div>
      <div className="history-toolbar">
        <label className="field history-toolbar__search">
          <span>Search title</span>
          <input value={historyQuery} onChange={(event) => onHistoryQueryChange(event.target.value)} placeholder="Search sessions" />
        </label>
        <label className="field history-toolbar__filter">
          <span>Status</span>
          <select
            value={historyStatus}
            onChange={(event) => onHistoryStatusChange(event.target.value as SessionHistoryStatusFilter)}
          >
            {HISTORY_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <motion.div
        className="list"
        initial={motionEnabled ? "hidden" : false}
        animate="visible"
        variants={STAGGER_VARIANTS}
      >
        {historyPage.items.length > 0 ? historyPage.items.map((session) => {
          const isEditing = editingSessionId === session.id;
          const isDeleteConfirming = confirmDeleteSessionId === session.id;
          const canDelete = session.status !== "active" && session.status !== "paused";

          return (
            <motion.div
              key={session.id}
              layout={motionEnabled}
              variants={STAGGER_ITEM_VARIANTS}
              className="list-row-shell"
            >
              {isEditing ? (
                <form
                  className="list-row-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const nextTitle = editingTitle.trim();
                    if (!nextTitle) {
                      return;
                    }
                    onRenameHistorySession(session.id, nextTitle);
                    cancelEditSession();
                  }}
                >
                  <label className="field list-row-edit__field">
                    <span>Session title</span>
                    <input
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      placeholder="Session title"
                      disabled={busy}
                      autoFocus
                    />
                  </label>
                  <div className="list-row__actions">
                    <button
                      type="submit"
                      className="button"
                      disabled={busy || editingTitle.trim().length === 0}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy}
                      onClick={cancelEditSession}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <motion.button
                    type="button"
                    className={selectedSessionId === session.id ? "list-row list-row--active" : "list-row"}
                    onClick={() => onSelectSession(session.id)}
                    whileTap={motionEnabled ? { scale: 0.99 } : undefined}
                  >
                    <span className="list-row__lead">
                      <span className="list-row__glyph">
                        {(() => {
                          const StatusIcon = getSessionStatusIcon(session.status);
                          return <IconGlyph icon={StatusIcon} size={18} active={selectedSessionId === session.id || session.status === "active"} />;
                        })()}
                      </span>
                      <span className="list-row__copy">
                        <strong className="list-row__title">{session.title}</strong>
                        <span className="list-row__subtitle">Target {formatDuration(session.targetWorkSeconds)}</span>
                      </span>
                    </span>
                    <span className={`list-row__status list-row__status--${session.status}`}>{session.status}</span>
                    <span className="list-row__trail">
                      <span>{formatDuration(session.workedSeconds)}</span>
                      <IconGlyph icon={ChevronRightIcon} size={16} />
                    </span>
                  </motion.button>
                  <div className="list-row__actions">
                    <button
                      type="button"
                      className="button button--ghost history-row-action"
                      disabled={busy}
                      onClick={() => beginEditSession(session)}
                    >
                      Edit
                    </button>
                    {canDelete ? (
                      isDeleteConfirming ? (
                        <>
                          <button
                            type="button"
                            className="button button--danger history-row-action"
                            disabled={busy}
                            onClick={() => onDeleteHistorySession(session.id)}
                          >
                            Delete?
                          </button>
                          <button
                            type="button"
                            className="button button--ghost history-row-action"
                            disabled={busy}
                            onClick={() => setConfirmDeleteSessionId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="button button--ghost history-row-action history-row-action--danger"
                          disabled={busy}
                          onClick={() => requestDeleteSession(session.id)}
                        >
                          Delete
                        </button>
                      )
                    ) : null}
                  </div>
                </>
              )}
            </motion.div>
          );
        }) : <div className="empty-state">No sessions match this filter.</div>}
      </motion.div>
      <div className="pagination-row">
        <span className="empty-state">Page {pageNumber} of {totalPages}</span>
        <div className="button-row">
          <button type="button" className="button button--ghost" disabled={busy || historyPage.offset <= 0} onClick={onPreviousPage}>
            <IconLabel icon={ChevronLeftIcon} label="Previous" />
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy || historyPage.offset + historyPage.limit >= historyPage.total}
            onClick={onNextPage}
          >
            <IconLabel icon={ChevronRightIcon} label="Next" />
          </button>
        </div>
      </div>
    </>
  );
}
