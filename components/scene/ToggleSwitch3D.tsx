"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";

import { LAMP, type LightRig } from "@/lib/types";

type ToggleSwitch3DProps = {
  rig: MutableRefObject<LightRig>;
  onToggle: () => void;
  shadows: boolean;
};

const PLATE_W = 0.64;
const PLATE_H = 0.98;
const PLATE_D = 0.05;
const BEZEL_W = 0.3;
const BEZEL_H = 0.5;
const PADDLE_W = 0.24;
const PADDLE_H = 0.44;
const PADDLE_D = 0.07;
/**
 * Rocker angle (radians about X). A real wall switch: press the top in for ON,
 * the bottom in for OFF. Negative tilts the top toward the wall.
 */
const ROCK_ON = -0.16;
const ROCK_OFF = 0.16;

/** ON / OFF engraved above and below the rocker, drawn into a texture (no font download). */
function engravingTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 400;
  const g = c.getContext("2d");
  if (!g) return null;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(225, 220, 210, 0.7)";
  g.font = "600 28px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.letterSpacing = "6px";
  g.fillText("ON", 128, 44);
  g.fillText("OFF", 128, 384);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export default function ToggleSwitch3D({ rig, onToggle, shadows }: ToggleSwitch3DProps) {
  const paddleRef = useRef<THREE.Group>(null);
  const paddleMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const stripeMat = useRef<THREE.MeshStandardMaterial>(null);
  const ledMat = useRef<THREE.MeshStandardMaterial>(null);
  const engraving = useMemo(engravingTexture, []);
  useEffect(() => () => engraving?.dispose(), [engraving]);

  const geo = useMemo(
    () => ({
      screw: new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24),
      slot: new THREE.BoxGeometry(0.036, 0.006, 0.006),
      stripe: new THREE.BoxGeometry(PADDLE_W * 0.42, 0.014, 0.004),
      led: new THREE.SphereGeometry(0.016, 16, 12),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const hoverAmount = useRef(0);

  useFrame((_, rawDelta) => {
    const r = rig.current;
    const dt = Math.min(rawDelta, 1 / 30);
    if (paddleRef.current) paddleRef.current.rotation.x = ROCK_OFF + (ROCK_ON - ROCK_OFF) * r.lever;
    hoverAmount.current += ((r.switchHover ? 1 : 0) - hoverAmount.current) * (1 - Math.exp(-dt * 12));
    // A faint warm edge on hover, so the rocker reads as the thing to press.
    if (paddleMat.current) paddleMat.current.emissiveIntensity = hoverAmount.current * 0.06;
    // The orange stripe on the paddle glows with the circuit, like a pilot light.
    if (stripeMat.current) stripeMat.current.emissiveIntensity = 0.15 + r.power * 2.2;
    if (ledMat.current) ledMat.current.emissiveIntensity = 0.05 + r.power * 3.5;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    rig.current.switchHover = true;
    document.body.style.cursor = "pointer";
  };
  const out = () => {
    rig.current.switchHover = false;
    document.body.style.cursor = "";
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onToggle();
  };
  const handlers = { onPointerOver: over, onPointerOut: out, onClick: click };

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  const z0 = PLATE_D / 2;

  return (
    <group position={[LAMP.switchX, LAMP.switchY, LAMP.wallZ + PLATE_D / 2 + 0.002]}>
      {/* Mounting plate: brushed dark metal. The whole plate is a click target. */}
      <RoundedBox args={[PLATE_W, PLATE_H, PLATE_D]} radius={0.02} smoothness={4} castShadow={shadows} receiveShadow={shadows} {...handlers}>
        <meshPhysicalMaterial color="#232326" metalness={0.75} roughness={0.42} clearcoat={0.2} clearcoatRoughness={0.4} />
      </RoundedBox>

      {/* Engraved ON / OFF */}
      {engraving && (
        <mesh position={[0, 0, z0 + 0.0015]}>
          <planeGeometry args={[PLATE_W * 0.62, PLATE_H * 0.86]} />
          <meshStandardMaterial map={engraving} transparent roughness={0.6} metalness={0.2} depthWrite={false} />
        </mesh>
      )}

      {/* Recessed bezel around the rocker */}
      <RoundedBox args={[BEZEL_W, BEZEL_H, 0.03]} radius={0.012} smoothness={3} position={[0, 0, z0 + 0.012]} receiveShadow={shadows} {...handlers}>
        <meshPhysicalMaterial color="#0c0c0d" metalness={0.6} roughness={0.55} />
      </RoundedBox>

      {/* The rocker paddle, pivoting about its middle */}
      <group ref={paddleRef} position={[0, 0, z0 + 0.03]} rotation={[ROCK_OFF, 0, 0]}>
        <RoundedBox args={[PADDLE_W, PADDLE_H, PADDLE_D]} radius={0.022} smoothness={4} position={[0, 0, PADDLE_D / 2 - 0.01]} castShadow={shadows} {...handlers}>
          <meshPhysicalMaterial
            ref={paddleMat}
            color="#2c2c30"
            metalness={0.82}
            roughness={0.28}
            clearcoat={0.5}
            clearcoatRoughness={0.25}
            emissive="#ffb02e"
            emissiveIntensity={0}
          />
        </RoundedBox>
        {/* Pilot stripe on the upper half */}
        <mesh geometry={geo.stripe} position={[0, PADDLE_H * 0.3, PADDLE_D - 0.008]}>
          <meshStandardMaterial ref={stripeMat} color="#3a1606" emissive="#ff6500" emissiveIntensity={0.15} toneMapped={false} />
        </mesh>
      </group>

      {/* Screws */}
      {[PLATE_H / 2 - 0.075, -PLATE_H / 2 + 0.075].map((y, i) => (
        <group key={y} position={[0, y, z0 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={geo.screw}>
            <meshPhysicalMaterial color="#3a3a3e" metalness={0.95} roughness={0.25} />
          </mesh>
          <mesh geometry={geo.slot} position={[0, -0.006, 0]} rotation={[0, i * 0.7 + 0.4, 0]}>
            <meshStandardMaterial color="#050505" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Status LED */}
      <mesh geometry={geo.led} position={[PLATE_W / 2 - 0.085, PLATE_H / 2 - 0.085, z0 + 0.006]}>
        <meshStandardMaterial ref={ledMat} color="#331100" emissive="#ff6500" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
    </group>
  );
}
