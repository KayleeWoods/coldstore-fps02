// The Coldstore map: geometry, collision boxes, spawns, bomb-site volumes and the bot
// nav routes. One array of AABB boxes drives the meshes, the collision and the line-of-
// sight tests, so all three can never disagree.
//
// Layout (x east, z south; raiders spawn south, depot north):
//   mid corridor up the middle, SITE A "freezer hall" in the west, SITE B "loading
//   bay" in the east, three lanes joined by cross corridors.

export const WALL_H = 3.6;

// [minX, minZ, maxX, maxZ, height, kind]  kind: 0 wall, 1 crate (half), 2 low rack
export const BOXES = [
  // outer shell
  [-17.5, -13.5, 17.5, -13, WALL_H, 0],
  [-17.5, 13, 17.5, 13.5, WALL_H, 0],
  [-17.5, -13.5, -17, 13.5, WALL_H, 0],
  [17, -13.5, 17.5, 13.5, WALL_H, 0],
  // long mid divider walls (leave center gap and side gaps)
  [-1.6, -13, -1.1, -4.5, WALL_H, 0],
  [-1.6, -1.5, -1.1, 3.5, WALL_H, 0],
  [1.1, -13, 1.6, -6.5, WALL_H, 0],
  [1.1, -3.5, 1.6, 2.5, WALL_H, 0],
  // freezer hall (site A) inner walls
  [-13, -9.5, -6, -9.0, WALL_H, 0],
  [-13, -0.5, -6, 0.0, WALL_H, 0],
  [-6.6, -7.5, -6.1, -2.0, WALL_H, 0], // A choke from mid
  // loading bay (site B) inner walls
  [6.1, -8.0, 6.6, -4.0, WALL_H, 0], // B choke
  [6, 0.5, 13, 1.0, WALL_H, 0],
  // lane cover in mid
  [-3.9, -4.6, -3.3, -2.6, 1.2, 1],
  [3.3, 2.0, 3.9, 4.0, 1.2, 1],
  // freezer crates
  [-12.3, -8.2, -10.9, -6.8, 1.2, 1],
  [-12.3, -3.4, -10.9, -2.0, 1.2, 1],
  [-9.4, -5.6, -8.0, -4.2, 1.2, 1],
  [-8.0, -8.6, -6.6, -7.2, 0.9, 2],
  // loading bay racks
  [8.4, -6.6, 9.8, -5.2, 1.2, 1],
  [11.0, -3.4, 12.4, -2.0, 1.2, 1],
  [8.0, -2.6, 9.4, -1.2, 0.9, 2],
  // raider yard cover
  [-8.5, 8.4, -7.1, 9.8, 1.2, 1],
  [7.1, 8.4, 8.5, 9.8, 1.2, 1],
  [-0.7, 7.0, 0.7, 8.4, 1.2, 1],
];

// Bomb sites (volumes): name, min/max on the floor.
export const SITES = [
  { name: 'A', minX: -13, minZ: -9, maxX: -6.2, maxZ: -0.8 },
  { name: 'B', minX: 6.2, minZ: -7.8, maxX: 12.8, maxZ: 0.6 },
];

export const SPAWNS = [
  // Depot (north)
  { x: -2.6, z: -11.6 }, { x: 2.6, z: -11.6 }, { x: -5.4, z: -11.6 }, { x: 5.4, z: -11.6 },
  // Raiders (south)
  { x: -2.6, z: 11.6 }, { x: 2.6, z: 11.6 }, { x: -5.4, z: 11.6 }, { x: 5.4, z: 11.6 },
];

// Waypoint routes. Raiders: two per site. Depot: holds at sites plus a mid watch.
export const ROUTES = {
  raiderA1: [{ x: -3, z: 8 }, { x: -9, z: 7 }, { x: -13, z: 3 }, { x: -12.5, z: -2.5 }, { x: -9.5, z: -4.5 }],
  raiderA2: [{ x: 0, z: 8 }, { x: -4, z: 5 }, { x: -9, z: 4.5 }, { x: -11.5, z: 0.5 }, { x: -8.5, z: -3 }],
  raiderB1: [{ x: 3, z: 8 }, { x: 9, z: 7 }, { x: 13, z: 2 }, { x: 12, z: -3 }, { x: 9, z: -5 }],
  raiderB2: [{ x: 0, z: 8.5 }, { x: 4, z: 4 }, { x: 9, z: 3.5 }, { x: 11.5, z: -0.5 }, { x: 8, z: -3 }],
  depotA1: [{ x: -2.6, z: -11 }, { x: -6, z: -8 }, { x: -9, z: -6.5 }],
  depotA2: [{ x: -2.6, z: -11 }, { x: -10, z: -10.5 }, { x: -12, z: -6 }],
  depotB1: [{ x: 2.6, z: -11 }, { x: 6.5, z: -8.5 }, { x: 9.5, z: -6.5 }],
  depotB2: [{ x: 2.6, z: -11 }, { x: 10, z: -11 }, { x: 12, z: -7.5 }],
  midWatch: [{ x: 0, z: -8 }, { x: 0, z: -5.5 }],
};

// Hold spots: where defenders park and aim after reaching their post. yaw in radians.
export const HOLDS = [
  { x: -9, z: -6.5, yaw: -1.2 },   // A main
  { x: -12, z: -6, yaw: 0.4 },     // A back
  { x: 9.5, z: -6.5, yaw: -1.9 },  // B main
  { x: 12, z: -7.5, yaw: 1.2 },    // B back
  { x: 0, z: -5.5, yaw: Math.PI }, // mid watch faces south
];

// --- collision -----------------------------------------------------------

// Push a circle (pos.x/z, radius r) out of every solid box. Two passes settle corners.
export function collide(pos, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < BOXES.length; i++) {
      const b = BOXES[i];
      if (b[5] === 2 && pos.y !== undefined && pos.y > b[4]) continue; // low racks: only block grounded bodies (simplified: always solid)
      const cx = pos.x < b[0] ? b[0] : pos.x > b[2] ? b[2] : pos.x;
      const cz = pos.z < b[1] ? b[1] : pos.z > b[3] ? b[3] : pos.z;
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // center inside the box: push out along the smallest penetration axis
        const px = pos.x - b[0] < b[2] - pos.x ? b[0] - r : b[2] + r;
        const pz = pos.z - b[1] < b[3] - pos.z ? b[1] - r : b[3] + r;
        if (Math.abs(px - pos.x) < Math.abs(pz - pos.z)) pos.x = px; else pos.z = pz;
      }
    }
  }
  // outer clamp
  if (pos.x < -16.5 + r) pos.x = -16.5 + r;
  if (pos.x > 16.5 - r) pos.x = 16.5 - r;
  if (pos.z < -12.5 + r) pos.z = -12.5 + r;
  if (pos.z > 12.5 - r) pos.z = 12.5 - r;
}

// True when nothing solid blocks the segment between two eye points.
export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    const top = b[4];
    let tmin = 0, tmax = 1;
    // x slab
    if (Math.abs(dx) < 1e-9) {
      if (ax < b[0] || ax > b[2]) continue;
    } else {
      let t1 = (b[0] - ax) / dx, t2 = (b[2] - ax) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // y slab (box from 0 to top)
    if (Math.abs(dy) < 1e-9) {
      if (ay < 0 || ay > top) continue;
    } else {
      let t1 = (0 - ay) / dy, t2 = (top - ay) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // z slab
    if (Math.abs(dz) < 1e-9) {
      if (az < b[1] || az > b[3]) continue;
    } else {
      let t1 = (b[1] - az) / dz, t2 = (b[3] - az) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return false; // this box intersects the segment
  }
  return true;
}

export function siteAt(x, z) {
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return i;
  }
  return -1;
}

// --- three.js scene ------------------------------------------------------

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildTextures, signTexture } from './textures.js';

export function buildMap(scene) {
  const group = new THREE.Group();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.canvas, 26, 74);

  const tex = buildTextures();
  tex.enamel.repeat.set(2, 1);
  const floorTex = tex.floor;
  floorTex.repeat.set(9, 7);
  const crateTex = tex.crate;
  crateTex.repeat.set(1, 1);

  const wallMat = new THREE.MeshLambertMaterial({ map: tex.enamel });
  const steelMat = new THREE.MeshLambertMaterial({ map: tex.enamel });
  const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
  const mats = [wallMat, crateMat, steelMat];

  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    const w = b[2] - b[0], d = b[3] - b[1], h = b[4];
    const m = new THREE.Mesh(box, mats[b[5]]);
    m.scale.set(w, h, d);
    m.position.set((b[0] + b[2]) / 2, h / 2, (b[1] + b[3]) / 2);
    group.add(m);
  }

  // every wall gets a dark plinth at its foot and a cap on top: two cheap boxes
  // that make the silhouette read as built structure instead of extruded blocks
  const plinthMat = new THREE.MeshLambertMaterial({ color: PALETTE.dark });
  const capMat = new THREE.MeshLambertMaterial({ color: PALETTE.hairline });
  for (const b of BOXES) {
    const w = b[2] - b[0], d = b[3] - b[1], h = b[4];
    if (h < 2.5) continue; // only full-height walls
    const px = (b[0] + b[2]) / 2, pz = (b[1] + b[3]) / 2;
    const plinth = new THREE.Mesh(box, plinthMat);
    plinth.scale.set(w + 0.06, 0.22, d + 0.06);
    plinth.position.set(px, 0.11, pz);
    group.add(plinth);
    const cap = new THREE.Mesh(box, capMat);
    cap.scale.set(w + 0.12, 0.09, d + 0.12);
    cap.position.set(px, h + 0.045, pz);
    group.add(cap);
  }

  // ceiling beams across the hall
  const beamMat = new THREE.MeshLambertMaterial({ color: PALETTE.hairline });
  for (let bz = -11; bz <= 11; bz += 4.4) {
    const beam = new THREE.Mesh(box, beamMat);
    beam.scale.set(34, 0.22, 0.3);
    beam.position.set(0, WALL_H + 0.25, bz);
    group.add(beam);
  }

  // doorway frames on the two site chokes, so the entrances read
  const frameMat = new THREE.MeshLambertMaterial({ color: PALETTE.accent });
  const frames = [
    [-6.35, -5.5, 0.18, 0.18, 3.0],
    [6.35, -6.0, 0.18, 0.18, 3.0],
  ];
  for (const [fx, fz, fw, fd, fh] of frames) {
    const post = new THREE.Mesh(box, frameMat);
    post.scale.set(fw, fh, fd);
    post.position.set(fx, fh / 2, fz);
    group.add(post);
  }

  // stencilled signage: the sites and the yard, plus hazard plate at each threshold
  const signs = [
    { text: 'A  FREEZER', x: -9.6, z: -0.45, y: 2.35, yaw: 0, accent: true },
    { text: 'B  LOADING', x: 9.6, z: 0.95, y: 2.35, yaw: Math.PI, accent: true },
    { text: 'COLDSTORE 7', x: 0, z: -13.2, y: 2.6, yaw: 0, accent: false },
    { text: 'KEEP CLOSED', x: -17.2, z: 0, y: 2.4, yaw: Math.PI / 2, accent: false },
  ];
  for (const sg of signs) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(sg.text, sg.accent), transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), mat);
    sign.position.set(sg.x, sg.y, sg.z);
    sign.rotation.y = sg.yaw;
    group.add(sign);
  }
  const hazard = tex.hazard;
  for (const [hx, hz, hyaw] of [[-6.45, -5.5, Math.PI / 2], [6.45, -6.0, Math.PI / 2]]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshLambertMaterial({ map: hazard }));
    plate.rotation.x = -Math.PI / 2;
    plate.rotation.z = hyaw;
    plate.position.set(hx, 0.03, hz);
    group.add(plate);
  }

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(35, 27), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // ceiling (open frost: high, dim)
  const ceilTex = tex.enamel;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(35, 27), new THREE.MeshLambertMaterial({ map: ceilTex }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H + 0.4;
  group.add(ceil);

  // bomb site markings: flat amber frames on the floor
  for (const s of SITES) {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 4, 1, Math.PI / 4),
      new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.55 }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set((s.minX + s.maxX) / 2, 0.03, (s.minZ + s.maxZ) / 2);
    g.scale.set(2.2, 1.4, 1);
    group.add(g);
  }

  // sodium lamps: emissive boxes hung from the ceiling + point lights
  // lamps glow without clipping: a lit housing, not a white slab
  const lampMat = new THREE.MeshLambertMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 0.55 });
  const lampSpots = [[-9.5, -4.5], [9.5, -3.5], [0, 0], [0, -9], [-9.5, 4], [9.5, 5], [0, 9]];
  for (const [lx, lz] of lampSpots) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.34), lampMat);
    lamp.position.set(lx, WALL_H + 0.2, lz);
    group.add(lamp);
  }

  // --- set dressing: crates, barrels, pallets, pipes, lane paint ----------
  // Decorative only, kept against walls so the collision boxes still describe
  // the space the player walks through.
  const crateMatDark = new THREE.MeshLambertMaterial({ map: crateTex });
  const unit = box;

  const crates = [
    // [x, z, w, d, h, y-offset, mat]
    [-12.9, -8.2, 1.5, 1.5, 1.3, 0, crateMatDark],
    [-11.4, -8.4, 1.2, 1.2, 2.2, 0, crateMat],
    [-12.9, -8.2, 1.1, 1.1, 0.9, 1.3, crateMat],
    [11.9, -7.0, 1.4, 1.4, 1.2, 0, crateMatDark],
    [10.4, -7.2, 1.2, 1.2, 2.4, 0, crateMat],
    [11.9, -7.0, 1.0, 1.0, 0.8, 1.2, crateMatDark],
    [-16.6, 6.4, 1.6, 3.2, 1.5, 0, crateMatDark],
    [16.6, -11.2, 3.0, 1.6, 1.6, 0, crateMatDark],
    [16.4, 9.6, 1.8, 1.8, 2.0, 0, crateMat],
    [-16.4, -11.0, 2.6, 1.6, 1.4, 0, crateMat],
  ];
  for (const [cx, cz, cw, cd, ch, lift, mat] of crates) {
    const m = new THREE.Mesh(unit, mat);
    m.scale.set(cw, ch, cd);
    m.position.set(cx, lift + ch / 2, cz);
    group.add(m);
  }

  // frost-rimed pallets and barrels near the sites
  const barrels = [[-13.6, -2.2], [-13.2, -1.1], [13.0, -3.0], [13.4, -1.6], [6.7, 3.4], [-6.9, 3.8]];
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10);
  const barrelMat = new THREE.MeshLambertMaterial({ color: PALETTE.hairline });
  for (const [bx, bz] of barrels) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(bx, 0.55, bz);
    group.add(b);
  }

  // ceiling pipe runs: read as depth in every long view
  const pipeGeo = new THREE.CylinderGeometry(0.13, 0.13, 33, 8);
  const pipeMat = new THREE.MeshLambertMaterial({ color: PALETTE.hairline });
  for (const [pz, py] of [[-6.4, 3.15], [6.2, 3.3], [0.2, 3.05]]) {
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, py, pz);
    group.add(pipe);
  }
  const crossPipeGeo = new THREE.CylinderGeometry(0.11, 0.11, 25, 8);
  for (const [px, py] of [[-5.2, 3.2], [5.4, 3.24]]) {
    const pipe = new THREE.Mesh(crossPipeGeo, pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, py, 0);
    group.add(pipe);
  }

  // lane paint and site stencils: thin planes a hair above the floor
  const paintMat = new THREE.MeshBasicMaterial({ color: PALETTE.muted, transparent: true, opacity: 0.22 });
  const amberPaint = new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.3 });
  const stripes = [
    [0, 6, 0.35, 9, paintMat], [0, -6.2, 0.35, 7, paintMat],
    [-8.9, 5.6, 0.28, 8, paintMat], [8.9, 5.2, 0.28, 8, paintMat],
    [-9.6, -4.4, 6.0, 0.3, amberPaint], [9.6, -3.6, 5.4, 0.3, amberPaint],
  ];
  const stripeGeo = new THREE.PlaneGeometry(1, 1);
  for (const [sx, sz, sw, sd, mat] of stripes) {
    const p = new THREE.Mesh(stripeGeo, mat);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(sw, sd, 1);
    p.position.set(sx, 0.02, sz);
    group.add(p);
  }

  // steel racks along the freezer hall's north wall and a loading platform in
  // the bay: they give the sites a silhouette and a sense of use
  const rackGeo = new THREE.BoxGeometry(2.6, 0.08, 0.9);
  const rackPost = new THREE.BoxGeometry(0.08, 2.1, 0.08);
  for (let i = 0; i < 3; i++) {
    const y = 0.45 + i * 0.62;
    const shelf = new THREE.Mesh(rackGeo, crateMatDark);
    shelf.position.set(-10.4, y, -8.4);
    group.add(shelf);
    for (const dx of [-1.2, 1.2]) {
      const post = new THREE.Mesh(rackPost, crateMatDark);
      post.position.set(-10.4 + dx, 1.05, -8.4);
      group.add(post);
    }
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 2.6), crateMatDark);
  platform.position.set(9.9, 0.25, 3.2);
  group.add(platform);
  const platformEdge = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
  platformEdge.position.set(9.9, 0.52, 1.9);
  group.add(platformEdge);

  // ice slick: a pale patch that catches the lamps
  const slick = new THREE.Mesh(new THREE.CircleGeometry(2.4, 14), new THREE.MeshLambertMaterial({
    color: PALETTE.frost, transparent: true, opacity: 0.18,
  }));
  slick.rotation.x = -Math.PI / 2;
  slick.position.set(-3.4, 0.015, -6.5);
  group.add(slick);

  scene.add(group);
  return group;
}
