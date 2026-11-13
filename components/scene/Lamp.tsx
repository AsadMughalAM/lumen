"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";

import { LAMP, PALETTE, type LightRig } from "@/lib/types";

/**
 * The hanging lamp: cable, anodised socket, glass tube and filament, plus the
 * point light that lives inside the glass. Everything hangs from a pivot at
 * the top of the cable so the whole fixture can sway as one pendulum.
 */

const CABLE_TOP = 7;
const PIVOT_Y = CABLE_TOP;

// Filament geometry (local to the tube top, y pointing down the tube).
const FIL_X = 0.165; // half-spacing of the U's legs
const FIL_TOP = -0.04; // just below the socket mouth
// The U's bend sits concentric with the glass's rounded end, so the glow reaches
// right down into the bottom of the tube.
const FIL_BOTTOM = -(LAMP.tubeLength - LAMP.tubeRadius) - FIL_X;

/** A smooth lathe profile for the socket: a cylinder with softly rounded rims. */
function socketGeometry() {
  const r = LAMP.socketRadius;
  const h = LAMP.socketHeight;
  const e = 0.035; // edge radius
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, h / 2)];
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 2) * (i / 6);
    pts.push(new THREE.Vector2(r - e + Math.sin(a) * e, h / 2 - e + Math.cos(a) * e));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 2) * (i / 6);
    pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e - Math.sin(a) * e));
  }
  pts.push(new THREE.Vector2(0.2, -h / 2));
  return new THREE.LatheGeometry(pts, 64);
}

/** The glass envelope: an open-topped tube with a hemispherical end. */
function tubeGeometry(radius: number) {
  const len = LAMP.tubeLength;
  const pts: THREE.Vector2[] = [new THREE.Vector2(radius, 0.02)];
  pts.push(new THREE.Vector2(radius, -(len - radius)));
  for (let i = 1; i <= 16; i++) {
    const a = (Math.PI / 2) * (i / 16);
    pts.push(new THREE.Vector2(Math.cos(a) * radius, -(len - radius) - Math.sin(a) * radius));
  }
  return new THREE.LatheGeometry(pts, 64);
}

/** The U-shaped element: down one leg, round the bottom, up the other. */
function filamentCurve() {
  const pts: THREE.Vector3[] = [];
  const legBottom = FIL_BOTTOM + FIL_X;
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-FIL_X, FIL_TOP + (legBottom - FIL_TOP) * (i / 12), 0));
  for (let i = 1; i < 16; i++) {
    const a = Math.PI + Math.PI * (i / 16);
    pts.push(new THREE.Vector3(Math.cos(a) * FIL_X, legBottom + Math.sin(a) * FIL_X, 0));
  }
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(FIL_X, legBottom + (FIL_TOP - legBottom) * (i / 12), 0));
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

/**
 * A 1D brightness map along the filament: slightly uneven, hotter round the
 * bend, cooler where the legs meet their supports, like a real heated element.
 */
function filamentHeatMap() {
  const w = 256;
  const data = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const u = i / (w - 1);
    const bend = Math.exp(-Math.pow((u - 0.5) / 0.14, 2)) * 0.18;
    const ends = Math.min(u, 1 - u) < 0.04 ? 0.55 + 11 * Math.min(u, 1 - u) : 1;
    const grain = 0.92 + 0.08 * Math.sin(u * 91.7) * Math.sin(u * 37.3);
    const v = Math.min(1, (0.82 + bend) * grain * ends);
    data.set([v * 255, v * 255, v * 255, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

type LampProps = {
  rig: MutableRefObject<LightRig>;
  shadows: boolean;
  /** Called when the visitor clicks the glass. */
  onBreak: () => void;
};

const cold = new THREE.Color(PALETTE.cold);
const deepOrange = new THREE.Color(PALETTE.outerGlow);
const orange = new THREE.Color(PALETTE.emission);
const amber = new THREE.Color(PALETTE.filament);
const hot = new THREE.Color(PALETTE.hotCore);

/** Filament colour as a function of temperature (black-body-ish ramp). */
function heatColor(t: number, out: THREE.Color) {
  if (t < 0.35) return out.copy(deepOrange).lerp(orange, t / 0.35);
  if (t < 0.8) return out.copy(orange).lerp(amber, (t - 0.35) / 0.45);
  return out.copy(amber).lerp(hot, (t - 0.8) / 0.2 * 0.35);
}

export default function Lamp({ rig, shadows, onBreak }: LampProps) {
  const pivotRef = useRef<THREE.Group>(null);
  const bulbRef = useRef<THREE.Group>(null);
  const filamentRef = useRef<THREE.Group>(null);
  const glassRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const onGlassOver = (e: ThreeEvent<PointerEvent>) => {
    const r = rig.current;
    if (r.broken || r.fit < 1) return;
    e.stopPropagation();
    r.bulbHover = true;
    document.body.style.cursor = "pointer";
  };
  const onGlassOut = () => {
    rig.current.bulbHover = false;
    document.body.style.cursor = "";
  };
  const onGlassClick = (e: ThreeEvent<MouseEvent>) => {
    const r = rig.current;
    if (r.broken || r.fit < 1) return;
    e.stopPropagation();
    document.body.style.cursor = "";
    onBreak();
  };
  const filamentMat = useRef<THREE.MeshStandardMaterial>(null);
  const supportMat = useRef<THREE.MeshStandardMaterial>(null);
  const glassMat = useRef<THREE.MeshPhysicalMaterial>(null);

  const geo = useMemo(
    () => ({
      cable: new THREE.CylinderGeometry(0.014, 0.014, CABLE_TOP - LAMP.socketTop, 12),
      connector: new THREE.CylinderGeometry(0.05, 0.065, 0.14, 32),
      socket: socketGeometry(),
      glass: tubeGeometry(LAMP.tubeRadius),
      filament: new THREE.TubeGeometry(filamentCurve(), 220, 0.016, 12, false),
      support: new THREE.CylinderGeometry(0.011, 0.011, Math.abs(FIL_BOTTOM - FIL_TOP) - 0.12, 10),
      mouth: new THREE.CylinderGeometry(LAMP.tubeRadius + 0.012, LAMP.tubeRadius + 0.012, 0.05, 48, 1, true),
    }),
    [],
  );
  const heatMap = useMemo(filamentHeatMap, []);
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      heatMap.dispose();
    },
    [geo, heatMap],
  );

  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame((state, rawDelta) => {
    const r = rig.current;
    const dt = Math.min(rawDelta, 1 / 30);
    const t = state.clock.elapsedTime;

    // Pendulum sway: a damped spring around the cable's anchor point.
    r.swayVelocity += (-14 * r.sway - 1.6 * r.swayVelocity) * dt;
    r.sway += r.swayVelocity * dt;
    if (pivotRef.current) pivotRef.current.rotation.z = r.sway;

    // Effective temperature: power, scaled by brightness, with a faint shimmer
    // (real elements are never perfectly still).
    const shimmer = 1 + (Math.sin(t * 7.3) * 0.006 + Math.sin(t * 13.1 + 1.7) * 0.004) * r.power;
    const level = r.power * (0.25 + 0.75 * r.brightness) * shimmer;

    if (filamentMat.current) {
      const m = filamentMat.current;
      heatColor(Math.min(level * 1.05, 1), scratch);
      m.emissive.copy(scratch);
      // Emission climbs steeply with temperature: dull red at first, blinding at full.
      m.emissiveIntensity = Math.pow(level, 1.6) * 9 + level * 0.6;
      m.color.copy(cold).lerp(scratch, Math.min(level * 2, 1) * 0.3);
    }
    if (supportMat.current) {
      const m = supportMat.current;
      m.emissive.copy(scratch);
      m.emissiveIntensity = Math.pow(level, 1.6) * 7.5;
    }
    if (glassMat.current) {
      // The glass picks up a warm cast once the filament glows, and catches a
      // little more light under the cursor (it's clickable).
      glassMat.current.attenuationColor.setRGB(1, 1 - level * 0.25, 1 - level * 0.45);
      glassMat.current.envMapIntensity = 1.4 + (r.bulbHover ? 0.9 : 0);
    }

    // ---- Break / replace ----
    const bulb = bulbRef.current;
    const fil = filamentRef.current;
    const glass = glassRef.current;
    if (bulb && fil && glass) {
      const tubeTop = LAMP.socketTop - LAMP.socketHeight;
      if (r.broken) {
        // Glass gone (the shards take over); the snapped filament tumbles out.
        glass.visible = false;
        const since = (performance.now() - r.breakTime) / 1000;
        fil.visible = since < 2.2;
        fil.position.set(since * 0.25, -4.2 * since * since, since * 0.4);
        fil.rotation.set(since * 0.9, 0, since * 1.8);
        bulb.position.y = tubeTop;
        bulb.rotation.y = 0;
      } else {
        // Intact, or a new bulb rising and turning as it screws in.
        glass.visible = true;
        fil.visible = true;
        fil.position.set(0, 0, 0);
        fil.rotation.set(0, 0, 0);
        const rise = 1 - r.fit;
        bulb.position.y = tubeTop - rise * 3.4;
        bulb.rotation.y = rise * Math.PI * 4;
      }
    }
    if (lightRef.current) {
      // Gentler falloff (decay 1.3) so the warmth reaches the edges of the room.
      lightRef.current.intensity = Math.pow(level, 1.3) * 16;
      heatColor(Math.min(level, 1) * 0.85, lightRef.current.color);
    }
  });

  const socketCenterY = LAMP.socketTop - LAMP.socketHeight / 2;
  const tubeTopY = LAMP.socketTop - LAMP.socketHeight;

  return (
    <group ref={pivotRef} position={[0, PIVOT_Y, 0]}>
      <group position={[0, -PIVOT_Y, 0]}>
        {/* Cable */}
        <mesh geometry={geo.cable} position={[0, (CABLE_TOP + LAMP.socketTop) / 2, 0]} castShadow={shadows}>
          <meshStandardMaterial color="#0b0b0b" roughness={0.7} metalness={0} />
        </mesh>

        {/* Connector + socket: dark anodised aluminium */}
        <mesh geometry={geo.connector} position={[0, LAMP.socketTop + 0.06, 0]} castShadow={shadows}>
          <meshPhysicalMaterial color="#121214" metalness={0.85} roughness={0.42} clearcoat={0.3} clearcoatRoughness={0.4} />
        </mesh>
        <mesh geometry={geo.socket} position={[0, socketCenterY, 0]} castShadow={shadows} receiveShadow={shadows}>
          <meshPhysicalMaterial
            color="#141416"
            metalness={0.88}
            roughness={0.34}
            clearcoat={0.35}
            clearcoatRoughness={0.35}
          />
        </mesh>
        {/* Thin collar where the glass meets the socket */}
        <mesh geometry={geo.mouth} position={[0, tubeTopY - 0.005, 0]}>
          <meshStandardMaterial color="#0e0e0f" metalness={0.8} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>

        {/* The light the filament gives off: lights the wall and the switch.
            It stays with the socket; it simply goes dark when there's no bulb. */}
        <pointLight
          ref={lightRef}
          position={[0, tubeTopY - 0.85, 0.02]}
          intensity={0}
          distance={0}
          decay={1.3}
          castShadow={shadows}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.002}
          shadow-radius={6}
          shadow-camera-near={0.2}
        />

        {/* The bulb: glass + filament. Shatters, falls away, and is replaced. */}
        <group ref={bulbRef} position={[0, tubeTopY, 0]}>
          <group ref={filamentRef}>
          {/* Filament: U-shaped element and its central support */}
          <mesh geometry={geo.filament}>
            <meshStandardMaterial
              ref={filamentMat}
              color={PALETTE.cold}
              roughness={0.5}
              metalness={0.3}
              emissive={PALETTE.outerGlow}
              emissiveMap={heatMap}
              emissiveIntensity={0}
              toneMapped={false}
            />
          </mesh>
          <mesh geometry={geo.support} position={[0, (FIL_TOP + FIL_BOTTOM) / 2 + 0.06, 0]}>
            <meshStandardMaterial
              ref={supportMat}
              color={PALETTE.cold}
              roughness={0.5}
              metalness={0.3}
              emissive={PALETTE.outerGlow}
              emissiveIntensity={0}
              toneMapped={false}
            />
          </mesh>
          </group>

          {/* Glass envelope: real transmission, slight thickness, crisp reflections.
              Click it to break it. */}
          <mesh
            ref={glassRef}
            geometry={geo.glass}
            renderOrder={2}
            onPointerOver={onGlassOver}
            onPointerOut={onGlassOut}
            onClick={onGlassClick}
          >
            <meshPhysicalMaterial
              ref={glassMat}
              color="#ffffff"
              transmission={1}
              thickness={0.08}
              roughness={0.04}
              ior={1.47}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.03}
              envMapIntensity={1.4}
              attenuationColor="#ffffff"
              attenuationDistance={2}
              specularIntensity={1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
