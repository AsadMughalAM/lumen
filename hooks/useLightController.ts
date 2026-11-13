"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

import type { AudioEngine } from "@/audio/AudioEngine";
import type { BulbState, LightRig, LightState } from "@/lib/types";

// Light transitions must resolve on real time: never stretch them when frames are slow.
gsap.ticker.lagSmoothing(0);

type Options = {
  rig: LightRig;
  audio: AudioEngine;
  reducedMotion: boolean;
};

/**
 * The single source of truth for the lamp.
 *
 *   Light:  OFF -> TURNING_ON -> ON -> TURNING_OFF -> OFF
 *   Bulb:   INTACT -> BROKEN -> FITTING -> INTACT
 *
 * The switch and the bulb are independent, like the real thing: the switch can
 * be ON with no working bulb, and a new bulb fitted while the switch is ON
 * lights up by itself. Each action kills whatever timeline is running and
 * starts from the *current* animated values, so rapid input always resolves to
 * the latest request without half states.
 */
export function useLightController({ rig, audio, reducedMotion }: Options) {
  const [state, setState] = useState<LightState>("OFF");
  const [bulb, setBulb] = useState<BulbState>("INTACT");
  const [switchOn, setSwitchOn] = useState(false);
  const switchRef = useRef(false);
  const bulbRef = useRef<BulbState>("INTACT");
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => () => void timeline.current?.kill(), []);

  const speed = reducedMotion ? 0.45 : 1;

  const setBulbState = useCallback((b: BulbState) => {
    bulbRef.current = b;
    setBulb(b);
  }, []);

  /** Heat the filament up on `tl`, starting at time `at`. */
  const heatUp = useCallback(
    (tl: gsap.core.Timeline, at: number) => {
      tl.call(() => audio.ignite(), [], at);
      const cold = rig.power < 0.1;
      if (cold) {
        // A brief flash, a dip, then ~1s of heating up to full temperature.
        tl.to(rig, { power: 0.16, duration: 0.06 * speed, ease: "power2.out" }, at + 0.02);
        tl.to(rig, { power: 0.08, duration: 0.08 * speed, ease: "power1.in" });
        tl.to(rig, { power: 1, duration: 1.0 * speed, ease: "power2.inOut" });
      } else {
        // Still warm from a moment ago: no flash, just climb back up.
        tl.to(rig, { power: 1, duration: 0.8 * speed, ease: "power2.out" }, at + 0.02);
      }
    },
    [audio, rig, speed],
  );

  const toggle = useCallback(async () => {
    // Audio may only start from a user gesture: this call always comes from one.
    await audio.unlock();

    const on = !switchRef.current;
    switchRef.current = on;
    setSwitchOn(on);
    timeline.current?.kill();

    const canLight = bulbRef.current === "INTACT";
    const tl = gsap.timeline();
    timeline.current = tl;

    // The lever always moves and always clicks: fast travel, firm stop (~300ms).
    audio.click(on ? 1 : 0.9);
    tl.to(rig, { lever: on ? 1 : 0, duration: 0.3, ease: "back.out(2.2)" }, 0);
    // The lamp gives a tiny swing on its cable as the circuit changes.
    if (!reducedMotion && canLight) rig.swayVelocity += on ? 0.05 : -0.035;

    if (!canLight) {
      // No working bulb: the switch clicks, nothing lights.
      setState("OFF");
      return;
    }

    setState(on ? "TURNING_ON" : "TURNING_OFF");
    tl.eventCallback("onComplete", () => setState(on ? "ON" : "OFF"));
    if (on) {
      heatUp(tl, 0.18);
    } else {
      // Shutdown: the element cools quickly at first, then lingers (~800ms).
      tl.call(() => audio.shutdown(), [], 0.08);
      tl.to(rig, { power: 0, duration: 0.8 * speed, ease: "power3.out" }, 0.1);
    }
  }, [audio, heatUp, reducedMotion, rig, speed]);

  /** Shatter the bulb. Works lit or unlit; a lit bulb flashes and sparks as it goes. */
  const breakBulb = useCallback(async () => {
    if (bulbRef.current !== "INTACT") return;
    await audio.unlock();
    timeline.current?.kill();

    const wasLit = rig.power > 0.05;
    rig.broken = true;
    rig.brokeLit = wasLit;
    rig.breakTime = performance.now();
    rig.bulbHover = false;
    if (!reducedMotion) rig.swayVelocity += 0.12;
    setBulbState("BROKEN");
    audio.shatter(wasLit);

    const tl = gsap.timeline({ onComplete: () => setState("OFF") });
    timeline.current = tl;
    if (wasLit) {
      // The filament's last flash as it snaps, then darkness.
      tl.to(rig, { power: Math.min(rig.power + 0.6, 1.5), duration: 0.03, ease: "power4.out" });
      tl.to(rig, { power: 0, duration: 0.12, ease: "power2.in" });
    } else {
      rig.power = 0;
    }
    setState("OFF");
  }, [audio, reducedMotion, rig, setBulbState]);

  /** Screw a new bulb in. If the switch is ON, it lights as soon as it's seated. */
  const replaceBulb = useCallback(async () => {
    if (bulbRef.current !== "BROKEN") return;
    await audio.unlock();
    timeline.current?.kill();

    rig.broken = false;
    rig.power = 0;
    rig.fit = 0;
    setBulbState("FITTING");

    const fitTime = 1.3 * speed;
    const tl = gsap.timeline();
    timeline.current = tl;
    tl.to(rig, { fit: 1, duration: fitTime, ease: "power3.out" }, 0);
    tl.call(() => audio.screwIn(fitTime * 0.85), [], 0.05);
    tl.call(
      () => {
        setBulbState("INTACT");
        if (switchRef.current) {
          setState("TURNING_ON");
          tl.eventCallback("onComplete", () => setState("ON"));
          heatUp(tl, fitTime + 0.1);
        }
      },
      [],
      fitTime,
    );
  }, [audio, heatUp, rig, setBulbState, speed]);

  return {
    state,
    bulb,
    switchOn,
    toggle,
    breakBulb,
    replaceBulb,
    isOn: state === "ON" || state === "TURNING_ON",
  };
}
