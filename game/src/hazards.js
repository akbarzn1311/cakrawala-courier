// Cakrawala Courier — the hazards: hot-air balloons and storm clouds.
// Balloons sit beside the course, close enough to see and to hit if the
// pilot drifts off the line; a hit pops the balloon and costs damage.
// Storm clouds drift across the route and shake the aircraft with
// turbulence when flown through. Both are seeded, so the same route has
// the same hazards on every load; they only drift and bob in real time.

import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './random.js';

const BALLOON_HIT_RADIUS = 7; // metres from the envelope centre
const BALLOON_DAMAGE = 12; // damage a popped balloon costs
const STORM_RADIUS = 30; // metres; inside one, the air is rough
const WARN_DISTANCE = 260; // metres ahead: the HUD warns about a hazard

// A point a fraction t along the leg from a to b, pushed sideways by `off`
// metres (perpendicular to the leg, in the horizontal plane) and up by `up`.
function legPoint(a, b, t, off, up) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  // A horizontal perpendicular to the leg.
  const px = -dz / len;
  const pz = dx / len;
  return {
    x: a.x + dx * t + px * off,
    y: a.y + (b.y - a.y) * t + up,
    z: a.z + dz * t + pz * off,
  };
}

function makeBalloon(scene, x, y, z, color) {
  const group = new THREE.Group();
  // The envelope: a bright sphere, squashed a little, with a band.
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 14, 12),
    new THREE.MeshLambertMaterial({ color }),
  );
  envelope.scale.y = 1.15;
  envelope.position.y = 4;
  group.add(envelope);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(5.2, 0.5, 6, 20),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 4;
  group.add(band);
  // The basket, hanging below on short lines.
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2, 2.4),
    new THREE.MeshLambertMaterial({ color: 0x7a4a21 }),
  );
  basket.position.y = -3.4;
  group.add(basket);
  group.position.set(x, y, z);
  group.name = 'balloon';
  scene.add(group);
  return { group, baseY: y, phase: Math.random() * Math.PI * 2, popped: false };
}

function makeStorm(scene, x, y, z, drift) {
  const group = new THREE.Group();
  // A dark, heavy cloud: several flattened spheres, nearly black-blue.
  const mat = new THREE.MeshBasicMaterial({
    color: 0x2e3440,
    transparent: true,
    opacity: 0.88,
    fog: false,
  });
  const rand = mulberry32(Math.floor(x + z));
  for (let k = 0; k < 6; k++) {
    const r = 12 + rand() * 12;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    puff.position.set((rand() - 0.5) * 34, (rand() - 0.5) * 6, (rand() - 0.5) * 24);
    puff.scale.y = 0.45;
    group.add(puff);
  }
  // A flicker of lightning inside, so it reads as a storm, not a shadow.
  const bolt = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 9),
    new THREE.MeshBasicMaterial({ color: 0xfff6a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false }),
  );
  bolt.position.set(0, -6, 6);
  group.add(bolt);
  group.position.set(x, y, z);
  group.name = 'storm';
  scene.add(group);
  return { group, drift, bolt, flash: 0 };
}

// Build the hazards for a route. `points` are the ring centres in order;
// the landing leg (last ring to the runway) gets one too.
export function createHazards(scene, points, runway) {
  const rand = mulberry32(20261126);
  const group = new THREE.Group();
  group.name = 'hazards';
  scene.add(group);

  const legs = [];
  for (let i = 0; i < points.length - 1; i++) legs.push([points[i], points[i + 1]]);
  legs.push([points[points.length - 1], { x: runway.x, y: runway.y + 60, z: runway.z }]);

  const balloonColors = [0xe63946, 0xf4a261, 0x2a9d8f, 0x9b5de5];
  const balloons = [];
  // Four balloons, one on each of the first four legs, set off the line
  // the autopilot flies so it never clips one, but close enough that a
  // pilot cutting a corner or drifting wide meets it.
  const legsWithBalloons = [0, 1, 2, 4];
  legsWithBalloons.forEach((legIdx, k) => {
    const [a, b] = legs[legIdx];
    const t = 0.45 + rand() * 0.2;
    const off = (rand() < 0.5 ? -1 : 1) * (42 + rand() * 28);
    const up = (rand() - 0.5) * 30;
    const p = legPoint(a, b, t, off, up);
    const b0 = makeBalloon(group, p.x, p.y, p.z, balloonColors[k % balloonColors.length]);
    balloons.push(b0);
  });

  const storms = [];
  // Two storm clouds drifting across the route area, high enough to meet
  // the course but low enough to see from the cockpit.
  const stormDefs = [
    { x: 350, y: 150, z: -350, drift: 3.5 },
    { x: -650, y: 165, z: -150, drift: -3.0 },
  ];
  for (const def of stormDefs) {
    storms.push(makeStorm(group, def.x, def.y, def.z, def.drift));
  }

  return {
    group,
    balloons,
    storms,
    // Step the hazards. Returns what the flight model should feel:
    // balloonHit (a balloon was just popped), turbulence { pitch, roll }
    // while inside a storm, and the nearest hazard ahead for the HUD.
    update(dt, flight, time) {
      let balloonHit = false;
      const turbulence = { pitch: 0, roll: 0 };
      for (const b of balloons) {
        if (b.popped) continue;
        // Bob gently; a balloon never sits dead still.
        b.group.position.y = b.baseY + Math.sin(time * 0.5 + b.phase) * 3;
        const d = b.group.position.distanceTo(flight.pos);
        if (d < BALLOON_HIT_RADIUS) {
          b.popped = true;
          b.group.visible = false;
          balloonHit = true;
        }
      }
      for (const s of storms) {
        s.group.position.x += s.drift * dt;
        if (s.group.position.x > 1500) s.group.position.x = -1500;
        if (s.group.position.x < -1500) s.group.position.x = 1500;
        // Lightning flickers at random, briefly.
        if (Math.random() < dt * 0.25) s.flash = 0.18;
        if (s.flash > 0) {
          s.flash -= dt;
          s.bolt.visible = s.flash > 0 && Math.sin(time * 40) > 0;
        } else {
          s.bolt.visible = false;
        }
        const d = s.group.position.distanceTo(flight.pos);
        if (d < STORM_RADIUS) {
          // Rough air: a slow, irregular shove on both axes.
          turbulence.pitch = Math.sin(time * 2.3) * 0.35 + Math.sin(time * 5.1) * 0.15;
          turbulence.roll = Math.cos(time * 1.9) * 0.4 + Math.sin(time * 4.3) * 0.15;
        }
      }
      return { balloonHit, turbulence, nearest: this.nearestAhead(flight) };
    },
    // The nearest hazard ahead of the aircraft (within the warning range),
    // for the HUD. Returns null when the way ahead is clear.
    nearestAhead(flight) {
      const fwd = new THREE.Vector3(
        -Math.sin(flight.yaw) * Math.cos(flight.pitch),
        Math.sin(flight.pitch),
        -Math.cos(flight.yaw) * Math.cos(flight.pitch),
      );
      let best = null;
      const consider = (pos, kind, range) => {
        const rel = new THREE.Vector3().subVectors(pos, flight.pos);
        const ahead = rel.dot(fwd);
        if (ahead < 20 || ahead > WARN_DISTANCE) return;
        const lateral = rel.clone().addScaledVector(fwd, -ahead).length();
        if (lateral > range) return;
        if (!best || ahead < best.distance) best = { kind, distance: Math.round(ahead) };
      };
      for (const b of balloons) {
        if (!b.popped) consider(b.group.position, 'balloon', 30);
      }
      for (const s of storms) consider(s.group.position, 'storm', STORM_RADIUS + 10);
      return best;
    },
    // Clear the hazards (a new route rebuilds them).
    dispose() {
      scene.remove(group);
    },
  };
}

export const HAZARD = { BALLOON_DAMAGE, STORM_RADIUS, WARN_DISTANCE };
