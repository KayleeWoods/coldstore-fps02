// Pooled tracers, muzzle flashes, impacts and smoke: fixed-size pools of three.js
// objects, recycled. No allocation per event.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const IMPACTS = 20;
const PUFFS = 12;

export function createFx(scene) {
  const tracers = [];
  const tGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  const tMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 1 });
  for (let i = 0; i < TRACERS; i++) {
    const m = new THREE.Mesh(tGeo, tMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, until: 0 });
  }

  const impacts = [];
  const iGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const iMatWall = new THREE.MeshBasicMaterial({ color: PALETTE.muted });
  const iMatFlesh = new THREE.MeshBasicMaterial({ color: PALETTE.accent });
  for (let i = 0; i < IMPACTS; i++) {
    const w = new THREE.Mesh(iGeo, iMatWall);
    const f = new THREE.Mesh(iGeo, iMatFlesh);
    w.visible = false; f.visible = false;
    scene.add(w); scene.add(f);
    impacts.push({ wall: w, flesh: f, until: 0 });
  }

  // smoke sprites: soft plane billboards (pool)
  const puffs = [];
  const pGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const pMat = new THREE.MeshBasicMaterial({ color: PALETTE.muted, transparent: true, opacity: 0.4, depthWrite: false });
  for (let i = 0; i < PUFFS; i++) {
    const m = new THREE.Mesh(pGeo, pMat.clone());
    m.visible = false;
    scene.add(m);
    puffs.push({ mesh: m, until: 0 });
  }

  let now = 0;
  let ti = 0, ii = 0, pi = 0;
  const v = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Matrix4();

  return {
    // Called with the packed event payload fields.
    tracer(x1, y1, z1, x2, y2, z2) {
      const t = tracers[ti]; ti = (ti + 1) % TRACERS;
      v.set(x1, y1, z1);
      mid.set(x2, y2, z2);
      const len = v.distanceTo(mid);
      t.mesh.position.lerpVectors(v, mid, 0.5);
      t.mesh.scale.set(1, 1, Math.max(0.2, len));
      look.lookAt(v, mid, up);
      t.mesh.quaternion.setFromRotationMatrix(look);
      t.mesh.visible = true;
      t.until = now + 0.05;
    },
    impact(x, y, z, flesh) {
      const it = impacts[ii]; ii = (ii + 1) % IMPACTS;
      const m = flesh ? it.flesh : it.wall;
      m.position.set(x, y, z);
      m.visible = true;
      it.until = now + 0.35;
    },
    puff(x, y, z, big) {
      const p = puffs[pi]; pi = (pi + 1) % PUFFS;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(big ? 3 : 1);
      p.mesh.material.opacity = big ? 0.6 : 0.35;
      p.mesh.visible = true;
      p.until = now + (big ? 1.4 : 0.7);
    },
    step(dt, camera) {
      now += dt;
      for (const t of tracers) if (t.mesh.visible && now >= t.until) t.mesh.visible = false;
      for (const it of impacts) {
        if (it.wall.visible && now >= it.until) it.wall.visible = false;
        if (it.flesh.visible && now >= it.until) it.flesh.visible = false;
      }
      for (const p of puffs) {
        if (!p.mesh.visible) continue;
        if (now >= p.until) { p.mesh.visible = false; continue; }
        p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - dt * 0.35);
        p.mesh.scale.multiplyScalar(1 + dt * 0.8);
        p.mesh.quaternion.copy(camera.quaternion);
      }
    },
  };
}
