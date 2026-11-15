// Muzzle flash: one pooled quad and one point light, shown for a few hundredths
// of a second on every shot. Nothing is allocated after construction.
//
// The quad always faces the camera because it is drawn as a child of the camera
// at the weapon's muzzle, which is what makes it read as a flash rather than a
// card floating in the world. The light is what sells it on the walls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FLASH_SECONDS = 0.06;
const LIGHT_SECONDS = 0.09;

export function createMuzzleFlash(camera) {
  const geo = new THREE.PlaneGeometry(0.26, 0.26);
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.accent,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(geo, mat);
  quad.position.set(0.2, -0.12, -0.92);
  quad.visible = false;
  camera.add(quad);

  const light = new THREE.PointLight(0xffc266, 0, 6, 2);
  light.position.copy(quad.position);
  light.visible = false;
  camera.add(light);

  let flashLeft = 0;
  let lightLeft = 0;

  return {
    // Called when a shot fires: no allocation, just two timers.
    fire() {
      flashLeft = FLASH_SECONDS;
      lightLeft = LIGHT_SECONDS;
      quad.visible = true;
      light.visible = true;
      light.intensity = 7;
      // a deterministic spin keeps two shots from looking identical without
      // touching the simulation's generator
      quad.rotation.z += 0.9;
    },
    step(dt) {
      if (flashLeft > 0) {
        flashLeft -= dt;
        mat.opacity = Math.max(0, flashLeft / FLASH_SECONDS) * 0.95;
        if (flashLeft <= 0) quad.visible = false;
      }
      if (lightLeft > 0) {
        lightLeft -= dt;
        light.intensity = Math.max(0, lightLeft / LIGHT_SECONDS) * 7;
        if (lightLeft <= 0) light.visible = false;
      }
    },
    // The shot-mode captures fire without a running clock, so the flash has to
    // be able to hold itself open for the screenshot.
    hold() {
      flashLeft = FLASH_SECONDS;
      lightLeft = LIGHT_SECONDS;
      quad.visible = true;
      light.visible = true;
      light.intensity = 7;
      mat.opacity = 0.95;
    },
  };
}
