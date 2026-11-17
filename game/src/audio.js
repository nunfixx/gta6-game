// Sound, 100% procedural WebAudio: engine hum by speed, a two-tone siren,
// gunshots, punches, thuds, pickup chimes, mission jingles and a bassline.
// Everything is guarded: with no audio device the game simply stays quiet.
export function createAudio(G) {
  const audio = {
    ctx: null, master: null, muted: false, engineOsc: null, engineOsc2: null,
    engineGain: null, sirenOsc: null, sirenGain: null, sirenTimer: null,
    bassTimer: null, bassStep: 0,
    ensure() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        return true;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.5;
        audio.master.connect(audio.ctx.destination);
        // Engine: two detuned oscillators through one gain.
        audio.engineGain = audio.ctx.createGain();
        audio.engineGain.gain.value = 0;
        audio.engineGain.connect(audio.master);
        audio.engineOsc = audio.ctx.createOscillator();
        audio.engineOsc.type = 'sawtooth';
        audio.engineOsc.frequency.value = 55;
        audio.engineOsc.connect(audio.engineGain);
        audio.engineOsc.start();
        audio.engineOsc2 = audio.ctx.createOscillator();
        audio.engineOsc2.type = 'square';
        audio.engineOsc2.frequency.value = 28;
        audio.engineOsc2.connect(audio.engineGain);
        audio.engineOsc2.start();
        // Siren: one oscillator, toggled between two tones.
        audio.sirenGain = audio.ctx.createGain();
        audio.sirenGain.gain.value = 0;
        audio.sirenGain.connect(audio.master);
        audio.sirenOsc = audio.ctx.createOscillator();
        audio.sirenOsc.type = 'square';
        audio.sirenOsc.frequency.value = 700;
        audio.sirenOsc.connect(audio.sirenGain);
        audio.sirenOsc.start();
        let high = false;
        audio.sirenTimer = setInterval(() => {
          if (!audio.ctx || audio.muted) return;
          high = !high;
          audio.sirenOsc.frequency.value = high ? 950 : 700;
        }, 380);
        // Bassline: A-minor groove, one eighth note per step.
        const bassNotes = [55, 0, 55, 65.41, 55, 0, 82.41, 73.42];
        audio.bassTimer = setInterval(() => {
          if (!audio.ctx || audio.muted || G.state !== 'playing') return;
          const f = bassNotes[audio.bassStep % bassNotes.length];
          audio.bassStep++;
          if (!f) return;
          const t = audio.ctx.currentTime;
          const o = audio.ctx.createOscillator();
          const g = audio.ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.12, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          o.connect(g);
          g.connect(audio.master);
          o.start(t);
          o.stop(t + 0.25);
        }, 210);
        return true;
      } catch {
        audio.ctx = null;
        return false;
      }
    },
    setEngine(speed01) {
      if (!audio.ctx || audio.muted) return;
      audio.engineGain.gain.value = 0.02 + speed01 * 0.06;
      audio.engineOsc.frequency.value = 55 + speed01 * 160;
      audio.engineOsc2.frequency.value = 28 + speed01 * 80;
    },
    engineOn() {
      audio.ensure();
    },
    engineOff() {
      if (audio.engineGain) audio.engineGain.gain.value = 0;
    },
    setSiren(on) {
      if (!audio.ctx) return;
      audio.sirenGain.gain.value = on && !audio.muted ? 0.045 : 0;
    },
    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      return audio.muted;
    },
    blip(freq, dur, type = 'sine', vol = 0.15) {
      if (!audio.ensure() || audio.muted) return;
      const t = audio.ctx.currentTime;
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(audio.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    shot() {
      if (!audio.ensure() || audio.muted) return;
      const t = audio.ctx.currentTime;
      const len = Math.floor(audio.ctx.sampleRate * 0.12);
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      const g = audio.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(filter);
      filter.connect(g);
      g.connect(audio.master);
      src.start(t);
    },
    punch() {
      audio.blip(180, 0.12, 'sine', 0.25);
    },
    thud() {
      audio.blip(90, 0.2, 'sine', 0.3);
    },
    pickup() {
      audio.blip(880, 0.15);
      setTimeout(() => audio.blip(1320, 0.2), 90);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.22), i * 110));
    },
  };
  G.audio = audio;
  return audio;
}
