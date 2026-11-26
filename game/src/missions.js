// Cakrawala Courier — the missions: rings to fly through, then a landing.
// A route is a set of glowing rings in order and a delivery on the runway.
// The next ring is green and pulses; later rings are amber; passed rings go
// grey. Finishing a route pays a landing bonus, refuels the aircraft and
// opens a new, harder route.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, ROUTE_ONE } from './config.js';
import { mulberry32 } from './random.js';

const C = CONFIG.colors;

function ringNormal(yaw, tilt = 0) {
  // The direction of flight through a ring whose yaw is the aircraft's yaw
  // as it passes: the aircraft's forward at pitch zero.
  const normal = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  if (tilt) {
    // Lean the ring's hole up or down: rotate the normal around the
    // horizontal axis across the flight direction, so the pilot must climb
    // or dive through the ring instead of flying level through it.
    const side = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    normal.applyAxisAngle(side, tilt);
  }
  return normal;
}

// A later route: rings drawn around the islands. Seeded, so the same route
// number is the same course every time. Ring sizes are the same varied mix
// as the first route — big, medium and small — shuffled with a separate
// seeded random, so the geometry stays the same as before and only the
// sizes change; the biggest ring goes first, so a new route still opens
// with a welcoming ring. Later rings lean more. (The yaw — which way a ring
// faces — is computed in createMission from the previous waypoint, so a ring
// always faces its approach.)
function generateRoute(index) {
  const rand = mulberry32(5000 + index * 7919);
  const points = [];
  const count = CONFIG.ringsPerRoute;
  // The varied size mix, shuffled per route (biggest first).
  const sizeRand = mulberry32(9000 + index * 331);
  const sizes = [28, 13, 20, 12, 22, 14];
  for (let k = sizes.length - 1; k > 0; k--) {
    const j = Math.floor(sizeRand() * (k + 1));
    [sizes[k], sizes[j]] = [sizes[j], sizes[k]];
  }
  const firstBig = sizes.indexOf(28);
  [sizes[0], sizes[firstBig]] = [sizes[firstBig], sizes[0]];
  // A smooth loop around the islands, like the first route: the angles are
  // nearly even and the radii stay close, so the course flows instead of
  // zig-zagging. A wild random scatter makes rings the autopilot — and a
  // new pilot — cannot line up on.
  const baseRadius = 950 + rand() * 150;
  // Start the loop east-south-east of the runway, so the first leg runs
  // along the island's low southern shore instead of cutting north-east
  // across the high ground — the aircraft takes off heading east and the
  // first ring must be ahead of it, not up a hillside.
  const baseAng = 0.45;
  for (let i = 0; i < count; i++) {
    const ang = baseAng + (i / count) * Math.PI * 2 + rand() * 0.35;
    const radius = baseRadius + (rand() - 0.5) * 220;
    points.push({
      x: Math.cos(ang) * radius,
      y: 100 + rand() * 80,
      z: Math.sin(ang) * radius * 0.8,
      radius: sizes[i],
      tilt: (i % 2 === 0 ? 1 : -1) * 0.25,
    });
  }
  return points;
}

function buildRingMesh(def, isNext) {
  const radius = def.radius ?? CONFIG.ringRadius;
  const geo = new THREE.TorusGeometry(radius, CONFIG.ringTube, 10, 42);
  const mat = new THREE.MeshBasicMaterial({
    color: isNext ? C.ringNext : C.ringLater,
    transparent: true,
    opacity: isNext ? 0.95 : 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(def.x, def.y, def.z);
  // Point the hole along the (tilted) normal, so the ring leans the way the
  // pilot has to fly through it.
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), def.normal);
  return mesh;
}

export function createMission(scene, routeIndex = 0, getHeight = null) {
  const raw = routeIndex === 0 ? ROUTE_ONE : generateRoute(routeIndex);
  // The yaw of a ring is the direction of flight through it: it faces the
  // waypoint the aircraft comes FROM, so the hole is square to the pilot on
  // the approach and the aircraft arrives already flying along the ring's
  // normal. Facing the next waypoint instead leaves the ring turned away
  // from the approach — the aircraft would have to reverse its heading at
  // the ring to fly through it cleanly. The first ring faces the runway.
  const r = CONFIG.runway;
  const defs = raw.map((p, i) => {
    const prev = i > 0 ? raw[i - 1] : { x: r.x, y: r.y, z: r.z };
    const yaw = Math.atan2(-(p.x - prev.x), -(p.z - prev.z));
    return { ...p, yaw, normal: ringNormal(yaw, p.tilt ?? 0) };
  });
  // A ring must clear the ground beneath it: raise any ring that would sit
  // too close to a hillside, so the course is always flyable.
  if (getHeight) {
    for (const def of defs) {
      const clearance = 55;
      const floor = getHeight(def.x, def.z) + clearance;
      if (def.y < floor) def.y = floor;
    }
  }
  const group = new THREE.Group();
  group.name = 'rings';
  scene.add(group);
  const rings = defs.map((def, i) => {
    const mesh = buildRingMesh(def, i === 0);
    group.add(mesh);
    return {
      def,
      mesh,
      center: new THREE.Vector3(def.x, def.y, def.z),
      normal: def.normal,
      radius: def.radius ?? CONFIG.ringRadius,
      passed: false,
      prevD: null,
    };
  });
  return {
    scene,
    group,
    rings,
    route: routeIndex,
    getHeight,
    current: 0,
    score: 0,
    routeTime: 0,
    landingPhase: false,
    objective: 'Terbang melewati ring 1 dari 6',
    statusLine: 'Rute 1 · Cakrawala Courier',
    // Where the HUD pointer aims: the next ring, or the runway at the end.
    target() {
      if (this.landingPhase) {
        const r = CONFIG.runway;
        return new THREE.Vector3(r.x, r.y + 8, r.z);
      }
      const ring = this.rings[this.current];
      return ring ? ring.center : new THREE.Vector3(0, 60, 0);
    },
  };
}

function refreshRingColors(mission, t) {
  mission.rings.forEach((ring, i) => {
    const mat = ring.mesh.material;
    if (ring.passed) {
      mat.color.setHex(C.ringDone);
      mat.opacity = 0.22;
    } else if (i === mission.current) {
      mat.color.setHex(C.ringNext);
      mat.opacity = 0.95;
      const pulse = 1 + 0.045 * Math.sin(t * 4.5);
      ring.mesh.scale.set(pulse, pulse, 1);
    } else {
      mat.color.setHex(C.ringLater);
      mat.opacity = 0.55;
      ring.mesh.scale.set(1, 1, 1);
    }
  });
}

// Step the mission. `event` is what the flight model reported this frame
// ('landed', 'hard-landing', 'crashed', 'takeoff' or null). Returns an event
// for the game loop: 'ring', 'route-complete', 'crashed' or null.
export function updateMission(mission, flight, event, dt) {
  mission.routeTime += dt;
  refreshRingColors(mission, mission.routeTime);

  if (event === 'crashed') return 'crashed';

  if (!mission.landingPhase) {
    const ring = mission.rings[mission.current];
    if (ring) {
      const rel = new THREE.Vector3().subVectors(flight.pos, ring.center);
      const d = rel.dot(ring.normal);
      if (ring.prevD === null) ring.prevD = d;
      if (ring.prevD < 0 && d >= 0) {
        // Crossed the ring's plane: did we go through the hole?
        const lateral = rel.clone().addScaledVector(ring.normal, -d).length();
        if (lateral < ring.radius) {
          ring.passed = true;
          mission.score += CONFIG.ringPoints;
          mission.current += 1;
          if (mission.current >= mission.rings.length) {
            mission.landingPhase = true;
            mission.objective = 'Semua ring dilewati — mendarat di landasan';
            return 'all-rings';
          }
          mission.objective = `Terbang melewati ring ${mission.current + 1} dari ${mission.rings.length}`;
          return 'ring';
        }
      }
      ring.prevD = d;
    }
  }

  if (event === 'landed' || event === 'hard-landing') {
    if (mission.landingPhase) {
      // A delivery: a soft touchdown pays in full, a hard one pays half.
      const points = event === 'landed' ? CONFIG.landingPoints : Math.floor(CONFIG.landingPoints / 2);
      const timeBonus = Math.max(0, Math.round((CONFIG.routeTimePar - mission.routeTime) / 10)) * 10;
      mission.score += points + timeBonus;
      return 'route-complete';
    }
  }
  return null;
}

// Start the next route: clear the old rings, build a new course, refuel.
export function nextRoute(mission) {
  const score = mission.score;
  mission.group.clear();
  const fresh = createMission(mission.scene, mission.route + 1, mission.getHeight);
  fresh.score = score;
  fresh.objective = `Rute ${fresh.route + 1} — terbang melewati ring 1 dari ${fresh.rings.length}`;
  fresh.statusLine = `Rute ${fresh.route + 1} · Cakrawala Courier`;
  return fresh;
}
