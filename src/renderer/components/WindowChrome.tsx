type WindowChromeProps = {
  maximized: boolean;
};

function WindowControlGlyph({
  kind
}: {
  kind: "minimize" | "maximize" | "restore" | "close";
}) {
  if (kind === "minimize") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 6.5h8" />
      </svg>
    );
  }

  if (kind === "maximize") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      </svg>
    );
  }

  if (kind === "restore") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M4 2.5h4.5A1 1 0 0 1 9.5 3.5V8" />
        <rect x="2.5" y="4" width="5.5" height="5.5" rx="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6" />
      <path d="M9 3 3 9" />
    </svg>
  );
}

export function WindowChrome({ maximized }: WindowChromeProps) {
  return (
    <div className="window-chrome">
      <div className="window-chrome__drag" aria-hidden="true" />
      <div className="window-chrome__controls">
        <button
          type="button"
          className="window-chrome__button window-chrome__button--minimize"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => void window.sessionTrail.app.minimizeWindow()}
        >
          <WindowControlGlyph kind="minimize" />
        </button>
        <button
          type="button"
          className="window-chrome__button window-chrome__button--maximize"
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => void window.sessionTrail.app.toggleMaximizeWindow()}
        >
          <WindowControlGlyph kind={maximized ? "restore" : "maximize"} />
        </button>
        <button
          type="button"
          className="window-chrome__button window-chrome__button--close"
          aria-label="Hide window"
          title="Hide"
          onClick={() => void window.sessionTrail.app.closeWindow()}
        >
          <WindowControlGlyph kind="close" />
        </button>
      </div>
    </div>
  );
}
