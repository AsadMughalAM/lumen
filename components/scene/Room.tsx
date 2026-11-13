"use client";

import { useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";

import { LAMP, PALETTE, type LightRig } from "@/lib/types";

/**
 * The dark studio: a matte charcoal wall behind the lamp that the bulb really
 * lights, a whisper of cool fill so the fixture is just visible when off, a
 * warm room fill that rises with the lamp so its light reaches the edges of the
 * frame, and a soft studio environment built from local light-formers (no HDR
 * download) for the subtle reflections on the metal and glass.
 */
export default function Room({ rig, shadows }: { rig: MutableRefObject<LightRig>; shadows: boolean }) {
  const warmRef = useRef<THREE.HemisphereLight>(null);
  const coolRef = useRef<THREE.AmbientLight>(null);

  useFrame(() => {
    const r = rig.current;
    const level = r.power * (0.25 + 0.75 * r.brightness);
    // Light bouncing round the room: warm from above, deeper from the floor.
    if (warmRef.current) warmRef.current.intensity = level * 0.9;
    // The cool night fill gives way as the warm light takes over.
    if (coolRef.current) coolRef.current.intensity = 0.35 * (1 - level * 0.7);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.background]} />

      {/* The wall: catches the bulb's warm light and the fixture's shadows. */}
      <mesh position={[0, 0, LAMP.wallZ]} receiveShadow={shadows}>
        <planeGeometry args={[40, 30]} />
        {/* Matte: no reflection of the studio lights (that showed as a pale ring). */}
        <meshStandardMaterial color={PALETTE.wall} roughness={0.95} metalness={0} envMapIntensity={0} />
      </mesh>

      {/* Cool night fill. It casts no shadows: only the bulb does. */}
      <ambientLight ref={coolRef} intensity={0.35} color="#9fb2c8" />
      <hemisphereLight ref={warmRef} args={["#ff9a4a", "#2a1206", 0]} />
      <directionalLight
        position={[2.5, 6, 5]}
        intensity={0.9}
        color="#b9c6d6"
      />

      <Environment resolution={128} frames={1}>
        {/* Tall soft strips at the sides: draw thin highlights down the socket and glass. */}
        <Lightformer form="rect" intensity={4} color="#d8dde6" position={[-4, 1, 3]} rotation={[0, Math.PI / 3, 0]} scale={[0.6, 6, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#c9d0dc" position={[4, 0.5, 2]} rotation={[0, -Math.PI / 3, 0]} scale={[0.4, 5, 1]} />
        {/* A dim overhead panel. */}
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[0, 5, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 2, 1]} />
      </Environment>
    </>
  );
}
