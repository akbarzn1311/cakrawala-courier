// Cakrawala Courier — the screenshot scenes.
// A URL like ?shot=ring&seed=1 sets the aircraft and the mission up for a
// good frame, then hands the stick to the autopilot so the composition holds
// while the shot is taken. These are real renders of the game itself, not
// staged pictures: the same scene a player sees, from a chosen moment.
// Every start is placed above the ground beneath it, and the aircraft is
// always pointed at its target, so the autopilot never has to recover.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

function place(flight, world, x, y, z, yaw, speed, throttle) {
  const ground = world.getHeight(x, z);
  flight.pos.set(x, Math.max(y, ground + 55), z);
  flight.yaw = yaw;
  flight.pitch = 0;
  flight.roll = 0;
  flight.speed = speed;
  flight.throttle = throttle;
  flight.engineOn = true;
  flight.onGround = false;
  flight.fuel = CONFIG.fuelMax;
}

// The scenes, keyed by the ?shot= name. Each returns the point the
// autopilot should steer toward (a ring, or a point above the runway) and
// the speed it should hold there. The mission is set to match the moment,
// so the HUD pointer and the ring colours agree with what the frame shows.
export function applyShot(game, name) {
  const { flight, mission, world } = game;
  const r = CONFIG.runway;
  const ring = (i) => mission.rings[i];

  function markPassed(count) {
    for (let i = 0; i < count && i < mission.rings.length; i++) {
      mission.rings[i].passed = true;
    }
    mission.current = Math.min(count, mission.rings.length);
  }

  switch (name) {
    case 'ring': {
      // About to thread the second ring, the green one ahead, over the sea.
      markPassed(1);
      mission.objective = 'Terbang melewati ring 2 dari 6';
      const g = ring(1);
      const n = g.normal;
      place(
        flight, world,
        g.center.x - n.x * 330,
        g.center.y + 12,
        g.center.z - n.z * 330,
        g.def.yaw,
        CONFIG.cruiseSpeed,
        0.65,
      );
      return { target: g.center, speed: CONFIG.cruiseSpeed };
    }
    case 'landing': {
      // Final approach from the sea to the south: over the coast and the
      // town, the strip lying across the view ahead, gear down. Close
      // enough that the runway reads, not just the town in front of it.
      markPassed(mission.rings.length);
      mission.landingPhase = true;
      mission.objective = 'Semua ring dilewati — mendarat di landasan';
      place(flight, world, 0, 110, 850, 0, 50, 0.35);
      return { target: new THREE.Vector3(r.x, r.y + 48, r.z), speed: 50 };
    }
    case 'town': {
      // Over the sea south of the town, flying north past the lighthouse.
      markPassed(2);
      mission.objective = 'Terbang melewati ring 3 dari 6';
      place(flight, world, 330, 200, 1100, 0, CONFIG.cruiseSpeed, 0.6);
      return { target: new THREE.Vector3(330, 30, 690), speed: CONFIG.cruiseSpeed };
    }
    case 'chase':
    default: {
      // The cover: a chase view over the home island, the first ring ahead.
      const g = ring(0);
      const n = g.normal;
      place(
        flight, world,
        g.center.x - n.x * 420,
        g.center.y + 25,
        g.center.z - n.z * 420,
        g.def.yaw,
        CONFIG.cruiseSpeed,
        0.65,
      );
      return { target: g.center, speed: CONFIG.cruiseSpeed };
    }
  }
}
