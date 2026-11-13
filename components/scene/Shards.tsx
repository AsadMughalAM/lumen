"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

import { BREAK_DEPTH, LAMP, type LightRig } from "@/lib/types";

const SHARDS = 46;
const SPARKS = 40;
const GRAVITY = -9.8 * 0.55;
const SHARD_LIFE = 2.6;
const SPARK_LIFE = 0.9;

type Particle = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3; // angular velocity
  s: number; // scale
  life: number;
};

/** One shard: an irregular thin sliver of glass. */
function shardGeometry() {
  const g = new THREE.BufferGeometry();
  // A flat, slightly bent quad-ish sliver so it catches light as it spins.
  const v = new Float32Array([
    0, 0.06, 0, -0.025, -0.02, 0.004, 0.03, -0.035, 0, 0, 0.06, 0, 0.03, -0.035, 0, 0.045, 0.02, -0.004,
  ]);
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Glass shards and sparks for the moment the bulb breaks. Both are instanced
 * meshes, simulated on the CPU for a couple of seconds, then hidden.
 */
export default function Shards({ rig }: { rig: MutableRefObject<LightRig> }) {
  const shardRef = useRef<THREE.InstancedMesh>(null);
  const sparkRef = useRef<THREE.InstancedMesh>(null);
  const lastBreak = useRef(0);

  const shardGeo = useMemo(shardGeometry, []);
  const sparkGeo = useMemo(() => new THREE.SphereGeometry(0.012, 6, 4), []);
  const shards = useMemo<Particle[]>(
    () =>
      Array.from({ length: SHARDS }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        w: new THREE.Vector3(),
        s: 1,
        life: 0,
      })),
    [],
  );
  const sparks = useMemo<Particle[]>(
    () =>
      Array.from({ length: SPARKS }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        w: new THREE.Vector3(),
        s: 1,
        life: 0,
      })),
    [],
  );
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }),
    [],
  );

  useEffect(
    () => () => {
      shardGeo.dispose();
      sparkGeo.dispose();
    },
    [shardGeo, sparkGeo],
  );

  const tubeTop = LAMP.socketTop - LAMP.socketHeight;

  /** Seed every particle from the surface of the tube at the moment of the break. */
  const burst = (lit: boolean) => {
    const R = LAMP.tubeRadius;
    const len = LAMP.tubeLength;
    // Only the part below the jagged break comes away; the top stays in the socket.
    const breakTop = BREAK_DEPTH.min;
    shards.forEach((s, i) => {
      const a = Math.random() * Math.PI * 2;
      const depth = breakTop + Math.random() * (len - breakTop);
      // Points on the lower tube wall and its rounded end.
      const capR = depth > len - R ? Math.sqrt(Math.max(R * R - Math.pow(depth - (len - R), 2), 0)) : R;
      s.p.set(Math.cos(a) * capR, tubeTop - depth, Math.sin(a) * capR);
      // It's a crack, not an explosion: pieces mostly drop, with a little outward kick.
      const out = 0.25 + Math.random() * 0.9;
      s.v.set(Math.cos(a) * out, 0.1 + Math.random() * 0.6, Math.sin(a) * out + 0.25);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      // A handful of bigger chunks among the small splinters.
      s.s = i < 5 ? 2.6 + Math.random() * 1.4 : 0.6 + Math.pow(Math.random(), 2) * 1.4;
      s.life = SHARD_LIFE * (0.75 + Math.random() * 0.25);
    });
    sparks.forEach((s) => {
      if (!lit) {
        s.life = 0;
        return;
      }
      s.p.set((Math.random() - 0.5) * 0.3, tubeTop - breakTop - Math.random() * (len - breakTop), (Math.random() - 0.5) * 0.1);
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      s.v.set(Math.cos(a) * sp, Math.random() * 2.5, Math.sin(a) * sp + 1);
      s.s = 0.6 + Math.random() * 0.9;
      s.life = SPARK_LIFE * (0.5 + Math.random() * 0.5);
    });
  };

  useFrame((_, rawDelta) => {
    const r = rig.current;
    const shardMesh = shardRef.current;
    const sparkMesh = sparkRef.current;
    if (!shardMesh || !sparkMesh) return;
    const dt = Math.min(rawDelta, 1 / 30);

    if (r.broken && r.breakTime !== lastBreak.current) {
      lastBreak.current = r.breakTime;
      burst(r.brokeLit);
    }

    let anyShard = false;
    shards.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y += GRAVITY * dt;
        s.v.multiplyScalar(1 - 0.4 * dt); // a little air drag
        s.p.addScaledVector(s.v, dt);
        s.r.x += s.w.x * dt;
        s.r.y += s.w.y * dt;
        s.r.z += s.w.z * dt;
        anyShard = true;
      }
      const scale = s.life > 0 ? s.s * Math.min(1, s.life / 0.4) : 0;
      tmp.q.setFromEuler(s.r);
      tmp.s.setScalar(scale);
      tmp.m.compose(s.p, tmp.q, tmp.s);
      shardMesh.setMatrixAt(i, tmp.m);
    });
    shardMesh.instanceMatrix.needsUpdate = true;
    shardMesh.visible = anyShard;

    let anySpark = false;
    sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y += GRAVITY * 1.4 * dt;
        s.p.addScaledVector(s.v, dt);
        anySpark = true;
      }
      const k = Math.max(s.life / SPARK_LIFE, 0);
      tmp.q.identity();
      tmp.s.setScalar(s.life > 0 ? s.s * (0.4 + k) : 0);
      tmp.m.compose(s.p, tmp.q, tmp.s);
      sparkMesh.setMatrixAt(i, tmp.m);
      // Sparks cool from white-yellow to red as they fly.
      tmp.c.setRGB(4 + 6 * k, 1.2 + 4 * k, 0.3 + 1.5 * k * k);
      sparkMesh.setColorAt(i, tmp.c);
    });
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    sparkMesh.visible = anySpark;
  });

  return (
    <group>
      <instancedMesh ref={shardRef} args={[shardGeo, undefined, SHARDS]} frustumCulled={false} visible={false}>
        <meshPhysicalMaterial
          color="#e8eef5"
          metalness={0.1}
          roughness={0.05}
          clearcoat={1}
          envMapIntensity={2.4}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={sparkRef} args={[sparkGeo, undefined, SPARKS]} frustumCulled={false} visible={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
