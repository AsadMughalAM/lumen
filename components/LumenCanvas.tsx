"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type BloomEffect, type VignetteEffect } from "postprocessing";

import Room from "./scene/Room";
import Lamp from "./scene/Lamp";
import ToggleSwitch3D from "./scene/ToggleSwitch3D";
import Shards from "./scene/Shards";
import type { LightRig } from "@/lib/types";

type LumenCanvasProps = {
  rig: MutableRefObject<LightRig>;
  onToggle: () => void;
  onBreak: () => void;
  quality: "high" | "low";
  parallax: boolean;
  onContextLost: () => void;
};

const FOV = 30;
const LOOK_AT = new THREE.Vector3(0, -0.25, 0);

/**
 * Frames lamp + switch at any aspect ratio, and drifts very slightly with the
 * pointer, like a slow camera move in a product film.
 */
function CameraRig({ parallax }: { parallax: boolean }) {
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const size = useThree((s) => s.size);
  const pointer = useRef({ x: 0, y: 0 });
  const current = useRef(new THREE.Vector3(0, -0.2, 9));

  useEffect(() => {
    if (!parallax) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onLeave = () => (pointer.current = { x: 0, y: 0 });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [parallax]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Keep ~4.6 units of height (socket to switch) and ~2.2 units of width in frame.
    const z = Math.max(2.3 / tan, 1.1 / (tan * aspect));
    const p = parallax ? pointer.current : { x: 0, y: 0 };
    const target = new THREE.Vector3(p.x * 0.35, -0.2 - p.y * 0.18, z);
    current.current.lerp(target, 1 - Math.exp(-dt * 2.2));
    camera.position.copy(current.current);
    camera.lookAt(LOOK_AT);
  });

  return null;
}

/** Bloom that rises and falls with the lamp, so OFF is genuinely dark. */
function Effects({ rig, quality }: { rig: MutableRefObject<LightRig>; quality: "high" | "low" }) {
  const bloomRef = useRef<BloomEffect>(null);
  const vignetteRef = useRef<VignetteEffect>(null);
  useFrame(() => {
    const r = rig.current;
    const level = r.power * (0.25 + 0.75 * r.brightness);
    if (bloomRef.current) bloomRef.current.intensity = 0.15 + r.power * (0.5 + 0.9 * r.brightness);
    // In the dark the frame closes in; when the lamp is on its light reaches the corners.
    if (vignetteRef.current) vignetteRef.current.darkness = 0.85 - level * 0.5;
  });
  return (
    <EffectComposer multisampling={quality === "high" ? 4 : 0} enableNormalPass={false}>
      {/* Threshold 1: only the filament (emission > 1, not tone-mapped) blooms. */}
      <Bloom ref={bloomRef} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.15} radius={0.78} intensity={0.15} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette ref={vignetteRef} offset={0.2} darkness={0.85} />
      <Noise opacity={0.025} blendFunction={BlendFunction.SOFT_LIGHT} />
    </EffectComposer>
  );
}

export default function LumenCanvas({ rig, onToggle, onBreak, quality, parallax, onContextLost }: LumenCanvasProps) {
  const shadows = quality === "high";
  return (
    <Canvas
      className="!absolute inset-0"
      shadows={shadows ? { type: THREE.PCFShadowMap } : false}
      dpr={quality === "high" ? [1, 2] : [1, 1.5]}
      flat
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, -0.2, 9] }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <CameraRig parallax={parallax} />
      <Room rig={rig} shadows={shadows} />
      <Lamp rig={rig} shadows={shadows} onBreak={onBreak} />
      <Shards rig={rig} />
      <ToggleSwitch3D rig={rig} onToggle={onToggle} shadows={shadows} />
      <Effects rig={rig} quality={quality} />
    </Canvas>
  );
}
