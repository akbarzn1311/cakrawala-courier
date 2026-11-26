// Cakrawala Courier — the world: islands, sea, sky, runway, town, clouds.
// Everything the aircraft flies over is built here from the seeded noise, so
// the terrain is the same on every load. The flight model asks getHeight()
// where the ground is; the renderer asks the meshes.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeNoise2D, mulberry32 } from './random.js';

const C = CONFIG.colors;

// The islands of the archipelago: centre, radius and peak height. The first
// is the home island, where the runway and the town sit.
const ISLANDS = [
  { x: 0,     z: 0,     r: 980, h: 150, peak: { x: 0,    z: -330, h: 65, s: 280 } },
  { x: 1350,  z: -750,  r: 330, h: 72,  peak: null },
  { x: 1520,  z: 720,   r: 390, h: 88,  peak: null },
  { x: -1360, z: -680,  r: 310, h: 62,  peak: null },
  { x: -1180, z: 1180,  r: 350, h: 78,  peak: null },
  { x: 260,   z: -1280, r: 270, h: 56,  peak: null },
];

const noise = makeNoise2D(CONFIG.terrainSeed);

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

// Distance from a point to the runway rectangle (0 inside it).
function runwayDist(x, z) {
  const r = CONFIG.runway;
  const dx = Math.max(Math.abs(x - r.x) - r.length / 2, 0);
  const dz = Math.max(Math.abs(z - r.z) - r.width / 2, 0);
  return Math.hypot(dx, dz);
}

// Distance from a point to the town apron rectangle (0 inside it).
function townDist(x, z) {
  const dx = Math.max(Math.abs(x - 190) - 150, 0);
  const dz = Math.max(Math.abs(z - 560) - 110, 0);
  return Math.hypot(dx, dz);
}

// Distance from a point to the clear approach corridor (0 inside it).
function approachDist(x, z) {
  const a = CONFIG.approach;
  const dx = Math.max(Math.max(a.x0 - x, x - a.x1), 0);
  const dz = Math.max(Math.max(a.z0 - z, z - a.z1), 0);
  return Math.hypot(dx, dz);
}

// True when (x, z) is inside the flat approach corridor or on the strip:
// the ground there is level, so an aircraft may settle onto it.
export function isOnApproach(x, z) {
  return approachDist(x, z) === 0 || runwayDist(x, z) === 0;
}

// The height of the land at (x, z). One function serves the mesh, the
// physics and anything that needs to sit on the ground, so they agree.
export function getHeight(x, z) {
  let h = -10; // seabed
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.hypot(dx, dz) / isl.r;
    if (d >= 1) continue;
    // A smooth island profile: high in the middle, fading to the shore.
    const fall = Math.cos(d * Math.PI * 0.5);
    const rough = 0.62 + 0.75 * noise(x * 0.0016 + 7.3, z * 0.0016 + 2.9);
    h = Math.max(h, isl.h * Math.pow(fall, 1.35) * rough);
    if (isl.peak) {
      const pd = Math.hypot(x - isl.peak.x, z - isl.peak.z);
      h += isl.peak.h * Math.exp(-(pd * pd) / (2 * isl.peak.s * isl.peak.s));
    }
  }
  // Fine detail so the slopes are not glass-smooth.
  h += 5 * (noise(x * 0.008 + 1.7, z * 0.008 + 8.4) - 0.5) * 2;
  // The canyon: two cliffs flanking a low gap the route threads on the way
  // to ring 4, north of the home island. The gap runs along the approach
  // (from ring 3 toward ring 4); the walls rise either side of it and end
  // just past the ring, so the aircraft can turn away to ring 5 without
  // meeting a wall. The floor stays at sea level, so the ring sits well
  // above it and the gap reads as a slot between cliffs.
  {
    const cuX = -0.959;
    const cuZ = -0.283; // along the canyon (the flight direction in)
    const cpX = 0.283;
    const cpZ = -0.959; // across the canyon
    const cx = 0;
    const cz = -1050; // the canyon's centre (ring 4)
    const s = (x - cx) * cuX + (z - cz) * cuZ;
    const v = (x - cx) * cpX + (z - cz) * cpZ;
    const along = smoothstep(120, 0, s) * smoothstep(-320, -240, s);
    const wall = smoothstep(48, 70, Math.abs(v)) * (1 - smoothstep(150, 220, Math.abs(v)));
    if (along > 0 && wall > 0) {
      h = Math.max(h, 120 * along * wall);
    }
  }
  // Level the runway strip, the clear approach corridor and the town apron.
  const rb = smoothstep(70, 0, runwayDist(x, z));
  if (rb > 0) h = h + (CONFIG.runway.y - h) * rb;
  const ab = smoothstep(60, 0, approachDist(x, z));
  if (ab > 0) h = h + (CONFIG.approach.y - h) * ab;
  const tb = smoothstep(60, 0, townDist(x, z));
  if (tb > 0) h = h + (13 - h) * tb;
  return h;
}

function colorForHeight(y, x, z) {
  const vary = 0.9 + 0.2 * noise(x * 0.02 + 4.1, z * 0.02 + 9.2);
  let c;
  if (y < 1.5) c = new THREE.Color(C.sand);
  else if (y < 9) c = new THREE.Color(C.grass).lerp(new THREE.Color(C.sand), 0.35);
  else if (y < 70) c = new THREE.Color(C.grass);
  else if (y < 125) c = new THREE.Color(C.forest);
  else if (y < 168) c = new THREE.Color(C.rock);
  else c = new THREE.Color(C.snow);
  c.multiplyScalar(vary);
  return c;
}

function buildTerrain(scene) {
  const size = CONFIG.worldSize;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getHeight(x, z);
    pos.setY(i, y);
    const col = colorForHeight(y, x, z);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  scene.add(mesh);
}

function buildSea(scene) {
  const geo = new THREE.PlaneGeometry(CONFIG.worldSize * 2.4, CONFIG.worldSize * 2.4);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: C.sea });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = CONFIG.seaLevel;
  sea.name = 'sea';
  scene.add(sea);
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(6500, 24, 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(C.skyTop);
  const horizon = new THREE.Color(C.skyHorizon);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getY(i) / 6500, 0, 1);
    const col = horizon.clone().lerp(top, Math.pow(t, 0.7));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  scene.add(sky);

  // The sun: a warm disc low in the west, where the directional light comes from.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(220, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
  );
  sun.position.set(-4200, 1500, -2600);
  sun.lookAt(0, 0, 0);
  sun.name = 'sun';
  scene.add(sun);
}

function buildRunway(scene) {
  const r = CONFIG.runway;
  const group = new THREE.Group();
  group.name = 'runway';

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(r.length, 0.7, r.width),
    new THREE.MeshLambertMaterial({ color: C.runway }),
  );
  strip.position.set(r.x, r.y + 0.1, r.z);
  group.add(strip);

  // Centreline dashes, big enough to read from the air.
  const dashMat = new THREE.MeshBasicMaterial({ color: C.runwayMark });
  for (let i = -3; i <= 3; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 2.2), dashMat);
    dash.position.set(r.x + i * 56, r.y + 0.5, r.z);
    group.add(dash);
  }
  // Continuous edge lines: the two white rails that make the strip read
  // as a runway from above.
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(r.length - 8, 0.12, 1.6), dashMat);
    edge.position.set(r.x, r.y + 0.5, r.z + side * (r.width / 2 - 2.5));
    group.add(edge);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 3.2), dashMat);
      bar.position.set(r.x + end * (r.length / 2 - 18), r.y + 0.5, r.z + k * 10);
      group.add(bar);
    }
  }
  // Edge lights, warm and lit, along both sides.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (let i = -5; i <= 5; i++) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), lightMat);
      lamp.position.set(r.x + i * 40, r.y + 0.9, r.z + side * (r.width / 2 - 1));
      group.add(lamp);
    }
  }
  // Windsock beside the strip.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(r.x + 150, r.y + 4.5, r.z - r.width / 2 - 14);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 8),
    new THREE.MeshLambertMaterial({ color: C.aircraftOrange }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(r.x + 154, r.y + 8.6, r.z - r.width / 2 - 14);
  group.add(sock);

  scene.add(group);
}

function buildTown(scene) {
  const rand = mulberry32(77);
  const group = new THREE.Group();
  group.name = 'town';
  const wallMat = new THREE.MeshLambertMaterial({ color: C.townWall });
  const roofMat = new THREE.MeshLambertMaterial({ color: C.townRoof });
  const wallMat2 = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  // A loose grid of streets around the apron.
  for (let gx = 0; gx < 6; gx++) {
    for (let gz = 0; gz < 5; gz++) {
      if (rand() < 0.22) continue; // a gap: a street, a garden
      const bx = 70 + gx * 42 + (rand() - 0.5) * 10;
      const bz = 480 + gz * 38 + (rand() - 0.5) * 8;
      const w = 12 + rand() * 8;
      const d = 10 + rand() * 6;
      const h = 8 + rand() * rand() * 20; // mostly low, a few tall
      const y = getHeight(bx, bz);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rand() < 0.5 ? wallMat : wallMat2);
      wall.position.set(bx, y + h / 2, bz);
      group.add(wall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3.5 + rand() * 2.5, 4), roofMat);
      roof.position.set(bx, y + h + 1.8, bz);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
    }
  }
  // A lighthouse on the southern shore, a landmark you can fly home by.
  const lx = 330;
  const lz = 690;
  const ly = getHeight(lx, lz);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 4.2, 26, 10),
    new THREE.MeshLambertMaterial({ color: 0xf5f2ea }),
  );
  tower.position.set(lx, ly + 13, lz);
  group.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 4, 10),
    new THREE.MeshLambertMaterial({ color: 0xc23b2a }),
  );
  band.position.set(lx, ly + 20, lz);
  group.add(band);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  lamp.position.set(lx, ly + 27.5, lz);
  group.add(lamp);
  scene.add(group);
}

function buildTrees(scene) {
  const rand = mulberry32(991);
  const positions = [];
  let guard = 0;
  while (positions.length < 70 && guard < 600) {
    guard++;
    const x = (rand() - 0.5) * 1700;
    const z = (rand() - 0.5) * 1700;
    const y = getHeight(x, z);
    if (y < 9 || y > 95) continue;
    if (runwayDist(x, z) < 90) continue;
    if (townDist(x, z) < 40) continue;
    positions.push([x, y, z, 0.8 + rand() * 0.9]);
  }
  const geo = new THREE.ConeGeometry(4.5, 13, 7);
  const mat = new THREE.MeshLambertMaterial({ color: C.forest });
  const trees = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  positions.forEach(([x, y, z, sc], i) => {
    p.set(x, y + 6 * sc, z);
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    trees.setMatrixAt(i, m);
  });
  trees.name = 'trees';
  scene.add(trees);
}

function buildClouds(scene) {
  const rand = mulberry32(4242);
  const clouds = [];
  // Unlit and soft: a cloud is bright in the sky, never a dark disc.
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, fog: false });
  for (let i = 0; i < 12; i++) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < puffs; k++) {
      const r = 12 + rand() * 16;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set((rand() - 0.5) * 48, (rand() - 0.5) * 5, (rand() - 0.5) * 22);
      puff.scale.y = 0.4;
      group.add(puff);
    }
    // High above the flight levels, so one never fills the camera.
    group.position.set((rand() - 0.5) * 3600, 380 + rand() * 140, (rand() - 0.5) * 3600);
    group.name = 'cloud';
    scene.add(group);
    clouds.push(group);
  }
  return clouds;
}

// Build the whole world into the scene. Returns the handles the game needs:
// getHeight, the runway rect, and an update() that drifts the clouds.
export function createWorld(scene) {
  buildSky(scene);
  buildSea(scene);
  buildTerrain(scene);
  buildRunway(scene);
  buildTown(scene);
  buildTrees(scene);
  const clouds = buildClouds(scene);

  // Light: a warm sun from the west and a soft sky fill.
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(-1400, 900, -800);
  scene.add(sun);
  const fill = new THREE.HemisphereLight(0xbfd9ee, 0x4a6b4f, 0.85);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xcfe0ea, 900, 4200);

  return {
    getHeight,
    runway: CONFIG.runway,
    update(dt) {
      for (const cloud of clouds) {
        cloud.position.x += dt * 6;
        if (cloud.position.x > 1900) cloud.position.x = -1900;
      }
    },
  };
}
