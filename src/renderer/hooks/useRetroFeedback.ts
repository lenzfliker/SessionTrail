import { useEffect, useEffectEvent, useRef, useState } from "react";

type RetroSoundName =
  | "app_startup"
  | "session_start"
  | "session_pause"
  | "session_resume"
  | "reminder"
  | "checkpoint_capture"
  | "checkpoint_save"
  | "export_complete"
  | "confirmation"
  | "error";

const SOUND_FILES: Record<RetroSoundName, string> = {
  app_startup: "/sounds/app-startup-sound.wav",
  session_start: "/sounds/start-sound-resume-sound.wav",
  session_pause: "/sounds/pause-sound.wav",
  session_resume: "/sounds/start-sound-resume-sound.wav",
  reminder: "/sounds/screenshot-reminder-sound.wav",
  checkpoint_capture: "/sounds/screenshot-reminder-sound.wav",
  checkpoint_save: "/sounds/delete-cancel-confirmation-sound.wav",
  export_complete: "/sounds/done-processing-done-impoting-done-exporting-sound.wav",
  confirmation: "/sounds/delete-cancel-confirmation-sound.wav",
  error: "/sounds/delete-cancel-confirmation-sound.wav"
};

export function useRetroFeedback(soundsEnabled: boolean, motionSettingEnabled: boolean) {
  const activeAudioRef = useRef(new Set<HTMLAudioElement>());
  const preloadedAudioRef = useRef<Partial<Record<RetroSoundName, HTMLAudioElement>>>({});
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    for (const name of Object.keys(SOUND_FILES) as RetroSoundName[]) {
      if (preloadedAudioRef.current[name]) {
        continue;
      }

      const audio = new Audio(SOUND_FILES[name]);
      audio.preload = "auto";
      preloadedAudioRef.current[name] = audio;
      audio.load();
    }
  }, []);

  useEffect(() => () => {
    for (const audio of activeAudioRef.current) {
      audio.pause();
      audio.src = "";
    }
    activeAudioRef.current.clear();
  }, []);

  useEffect(() => {
    if (soundsEnabled) {
      return;
    }

    for (const audio of activeAudioRef.current) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeAudioRef.current.clear();
  }, [soundsEnabled]);

  const play = useEffectEvent((name: RetroSoundName) => {
    if (!soundsEnabled) {
      return;
    }

    const source = preloadedAudioRef.current[name]?.src || SOUND_FILES[name];
    const audio = new Audio(source);
    audio.preload = "auto";
    activeAudioRef.current.add(audio);

    const cleanup = () => {
      audio.pause();
      audio.src = "";
      activeAudioRef.current.delete(audio);
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
    };

    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);

    void audio.play().catch(() => {
      cleanup();
    });
  });

  return {
    motionEnabled: motionSettingEnabled && !prefersReducedMotion,
    prefersReducedMotion,
    play
  };
}
