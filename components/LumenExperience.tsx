"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import { AudioEngine } from "@/audio/AudioEngine";
import { useLightController } from "@/hooks/useLightController";
import { createRig, type LightRig, type LightState } from "@/lib/types";

const LumenCanvas = dynamic(() => import("./LumenCanvas"), { ssr: false });

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const STATUS_COPY: Record<LightState, string> = {
  OFF: "Off",
  TURNING_ON: "Warming",
  ON: "On",
  TURNING_OFF: "Cooling",
};

const SOUND_KEY = "lumen:sound";

export default function LumenExperience() {
  const rigRef = useRef<LightRig>(null);
  if (!rigRef.current) rigRef.current = createRig();
  const rig = rigRef as React.MutableRefObject<LightRig>;
  const audio = useMemo(() => new AudioEngine(), []);
  useEffect(() => () => audio.dispose(), [audio]);

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const [webgl, setWebgl] = useState<"checking" | "ok" | "none">("checking");
  const [contextLost, setContextLost] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [brightness, setBrightness] = useState(80);
  const [hintSeen, setHintSeen] = useState(false);

  const { state, bulb, switchOn, toggle, breakBulb, replaceBulb, isOn } = useLightController({
    rig: rig.current,
    audio,
    reducedMotion,
  });

  useEffect(() => {
    setWebgl(hasWebGL() ? "ok" : "none");
    // Remember the sound preference for this session only.
    try {
      const saved = sessionStorage.getItem(SOUND_KEY);
      if (saved !== null) setSoundOn(saved === "on");
    } catch {}
  }, []);

  useEffect(() => {
    audio.setMuted(!soundOn);
    try {
      sessionStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
    } catch {}
  }, [audio, soundOn]);

  useEffect(() => audio.setVolume(volume), [audio, volume]);

  useEffect(() => {
    rig.current.brightness = brightness / 100;
    audio.setHumBrightness(brightness / 100);
  }, [audio, brightness, rig]);

  const handleToggle = useCallback(() => {
    setHintSeen(true);
    void toggle();
  }, [toggle]);
  const handleBreak = useCallback(() => {
    setHintSeen(true);
    void breakBulb();
  }, [breakBulb]);
  const handleReplace = useCallback(() => void replaceBulb(), [replaceBulb]);

  // Keyboard: Space or L toggles the light from anywhere (when focus isn't in a control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range"));
      // L works everywhere except text fields; Space only when it isn't already
      // pressing a focused button or nudging a slider.
      const onControl = !!el && (el.tagName === "BUTTON" || el.tagName === "INPUT");
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === "l" || (e.code === "Space" && !onControl)) {
        e.preventDefault();
        handleToggle();
      } else if (key === "b") {
        handleBreak();
      } else if (key === "n") {
        handleReplace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleBreak, handleReplace, handleToggle]);

  const transitioning = state === "TURNING_ON" || state === "TURNING_OFF";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#101010] text-white select-none">
      {webgl === "ok" && !contextLost && (
        <LumenCanvas
          rig={rig}
          onToggle={handleToggle}
          onBreak={handleBreak}
          quality={coarse ? "low" : "high"}
          parallax={!coarse && !reducedMotion}
          onContextLost={() => setContextLost(true)}
        />
      )}
      {(webgl === "none" || contextLost) && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="max-w-[34ch] text-[13px] leading-relaxed text-white/55">
            {contextLost
              ? "The graphics context was lost. Reload the page to bring the light back."
              : "This browser can't run WebGL, which LUMEN needs to render the light."}
          </p>
        </div>
      )}

      {/* Wordmark */}
      <header className="pointer-events-none absolute left-5 top-5 md:left-8 md:top-7">
        <p className="text-[13px] font-semibold tracking-[0.42em] text-white/90">LUMEN</p>
        <p className="mt-1.5 text-[12px] text-white/45">An interactive study of light.</p>
      </header>

      {/* Lower controls: status, power, brightness */}
      <section
        aria-label="Light controls"
        className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-3 px-5 md:bottom-7"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`block h-1.5 w-1.5 rounded-full transition-all duration-700 ${
              isOn ? "bg-[#ff8a2a] shadow-[0_0_10px_2px_rgba(255,120,40,0.6)]" : "bg-white/20"
            }`}
          />
          <span className="label tabular-nums" aria-live="polite">
            {bulb === "BROKEN" ? "Bulb broken" : bulb === "FITTING" ? "Fitting bulb" : STATUS_COPY[state]}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            aria-pressed={switchOn}
            aria-label={switchOn ? "Switch the light off" : "Switch the light on"}
            className="label rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition-colors hover:border-white/30 hover:text-white"
          >
            {switchOn ? "Switch off" : "Switch on"}
          </button>
          {bulb === "BROKEN" && (
            <button
              type="button"
              onClick={handleReplace}
              className="label rounded-full border border-[#ff8a2a]/50 bg-[#ff8a2a]/10 px-3 py-1.5 text-[#ffc58a] transition-colors hover:border-[#ff8a2a] hover:bg-[#ff8a2a]/20 hover:text-white"
            >
              Fit a new bulb
            </button>
          )}
        </div>

        <label
          className={`flex w-[min(260px,80vw)] items-center gap-3 transition-opacity duration-500 ${
            isOn ? "opacity-100" : "opacity-35"
          }`}
        >
          <span className="label w-[78px] shrink-0">Brightness</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brightness}
            disabled={!isOn}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="range flex-1"
            style={{ "--fill": `${brightness}%` } as React.CSSProperties}
            aria-valuetext={`${brightness}%`}
          />
          <span className="label w-9 text-right tabular-nums">{brightness}%</span>
        </label>
      </section>

      {/* Bottom-right: sound */}
      <section aria-label="Sound" className="absolute bottom-5 right-5 hidden items-center gap-3 md:bottom-7 md:right-8 md:flex">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={!soundOn}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className={`range w-20 transition-opacity ${soundOn ? "opacity-100" : "opacity-30"}`}
          style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
        />
        <button
          type="button"
          onClick={() => setSoundOn((s) => !s)}
          aria-pressed={soundOn}
          className="label rounded-full border border-white/12 px-3 py-1.5 text-white/75 transition-colors hover:border-white/30 hover:text-white"
        >
          Sound {soundOn ? "on" : "off"}
        </button>
      </section>
      {/* Mobile sound toggle sits top-right. */}
      <button
        type="button"
        onClick={() => setSoundOn((s) => !s)}
        aria-pressed={soundOn}
        className="label absolute right-5 top-5 rounded-full border border-white/12 px-3 py-1.5 text-white/75 md:hidden"
      >
        Sound {soundOn ? "on" : "off"}
      </button>

      {/* Hint, fades once the light has been switched. */}
      <p
        className={`label pointer-events-none absolute bottom-5 left-5 hidden transition-opacity duration-1000 md:bottom-7 md:left-8 md:block ${
          hintSeen ? "opacity-0" : "opacity-100"
        }`}
      >
        Click the switch to light it · click the bulb to break it
      </p>

      {transitioning && <span className="sr-only">Light is {STATUS_COPY[state].toLowerCase()}</span>}
    </main>
  );
}
