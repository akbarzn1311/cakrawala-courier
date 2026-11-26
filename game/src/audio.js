// Cakrawala Courier — procedural sound. No audio files: every sound is
// built from oscillators and filtered noise in the Web Audio API. The engine
// hum follows the throttle, the wind follows the airspeed, and the rings,
// the landing and the crash each have their own voice.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windFilter = null;
  let windGain = null;
  let started = false;
  let lastWarn = 0;

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(freq, dur, type, gain, when = 0) {
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const audio = {
    // Call from a user gesture (the start click): browsers only let audio
    // start after one.
    start() {
      if (started) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
      started = true;

      // Engine: two saws through a lowpass, pitched by the throttle, with
      // a slow chop on the gain for the propeller.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 104;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const chop = ctx.createOscillator();
      chop.frequency.value = 13;
      const chopGain = ctx.createGain();
      chopGain.gain.value = 0.03;
      chop.connect(chopGain).connect(engineGain.gain);
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      chop.start();

      // Wind: looped noise through a bandpass that opens with speed.
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer(2);
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter).connect(windGain).connect(ctx.destination);
      windSource.start();
    },

    // Called every frame with the flight state.
    update(flight) {
      if (!started || !ctx) return;
      const t = ctx.currentTime;
      const rpm = flight.engineOn ? 0.25 + flight.throttle * 0.75 : 0;
      const target = flight.engineOn ? 0.05 + flight.throttle * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.08);
      engineOsc.frequency.setTargetAtTime(48 + rpm * 68, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(96 + rpm * 132, t, 0.1);
      engineFilter.frequency.setTargetAtTime(320 + rpm * 700, t, 0.1);
      const wind = Math.min(1, flight.speed / 90);
      windGain.gain.setTargetAtTime(wind * 0.14, t, 0.12);
      windFilter.frequency.setTargetAtTime(380 + wind * 900, t, 0.15);
    },

    ring() {
      if (!started) return;
      tone(659.25, 0.35, 'sine', 0.16);
      tone(830.61, 0.35, 'sine', 0.16, 0.07);
      tone(987.77, 0.5, 'sine', 0.18, 0.14);
    },

    land() {
      if (!started) return;
      tone(70, 0.3, 'sine', 0.3);
      tone(140, 0.18, 'triangle', 0.12, 0.02);
    },

    crash() {
      if (!started) return;
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.7);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t0);
      filter.frequency.exponentialRampToValueAtTime(90, t0 + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start(t0);
      tone(48, 0.7, 'sine', 0.35);
    },

    warn() {
      if (!started) return;
      const now = performance.now();
      if (now - lastWarn < 2000) return;
      lastWarn = now;
      tone(880, 0.16, 'square', 0.05);
    },

    click() {
      if (!started) return;
      tone(520, 0.08, 'sine', 0.1);
    },
  };
  return audio;
}
