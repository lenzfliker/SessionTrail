# SessionTrail — UI Spec (Minimal Brutalist)

## Design language

- monochrome or near-monochrome
- strong black borders
- flat surfaces
- minimal or zero shadows
- sharp corners
- bold labels
- dense but readable spacing
- no decorative animation

## Global tokens

- background: white / off-white
- foreground: black
- accent: optional muted gray or warning yellow/red for states
- border width: 2px
- radius: 0 to 4px max
- font: system UI stack
- heading weight: 700+
- body weight: 400–500

## Screens

### 1. Dashboard

Shows:

- current session state
- worked time
- wall time
- next reminder ETA
- buttons:
  - Start
  - Pause
  - Resume
  - Complete
  - Open Timeline

### 2. Checkpoint modal

Shows:

- captured screenshot preview
- worked time label
- short note textarea
- save button
- skip/close behavior must not delete screenshot shell

### 3. Timeline screen

Shows:

- list of work segments
- list of checkpoints in chronological order
- screenshot thumbnails
- editable note text
- manual checkpoint button
- export button

### 4. Export screen

Shows:

- voice-over asset state
- record voice-over
- preview voice-over
- appendix video selection
- appendix video removal
- export progress

### 5. Recovery dialog

Shows:

- interrupted session summary
- last known worked time
- options:
  - Resume
  - Leave Paused
  - End Session

## UX rules

- actions should be obvious
- labels should be literal, not clever
- confirm destructive actions
- recovery prompts should be prominent
