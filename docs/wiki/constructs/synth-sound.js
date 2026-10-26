Wiki.construct({
  id: "synth-sound",
  name: "Synthesised, coalesced sound",
  family: "feel",
  origin: "playground",
  status: "built",
  statusNote: "Built; captures and headless runs are silent by design. An earlier filter that suppressed launch audio for strikes exhausted before playback has been removed with the old energy model.",
  summary: "Every sound is generated in Lua from a family's pitch and a kind's envelope, cached once, and played through a per-key cooldown and a 16-voice cap so a volley or a beam reads as one event, not a wall of noise.",
  tags: ["audio", "procedural", "coalescing", "voice limit", "no assets"],

  intent:
    "<p>The playground has no asset files, sounds included, so each damage family's voice is synthesised: a short pitched chirp whose base pitch is the family's identity (Sharp 760 Hz, Impact 150, Plasma 330; see [[hit-feedback]]). The harder problem is density. A five-pellet shotgun is five launches and up to five hits in the same frame, a beam damages every tick, and thirty enemies can die in half a second. Played literally, that is a clipped roar that says nothing. Coalescing keeps one audible event per kind and family per short window, so the ear hears rhythm and family rather than count.</p>",

  how:
    "<h3>Who does what</h3>" +
    "<p>The simulation never touches audio. <code>feedback.sound</code> appends a request <code>{kind, id, power}</code> to a queue on the run (cap 32, oldest dropped), with a pitch jitter of 0.97-1.03 drawn from the cosmetic random stream. Once a frame, <code>sound.update</code> (the only file that calls <code>love.audio</code>) drains the queue and decides what plays. Every decision, played or suppressed, goes to the event trace with a reason: <code>sound_cooldown</code>, <code>voice_limit</code>, <code>queue_limit</code>, <code>target_cooldown</code>, <code>audio_disabled</code>, <code>muted</code>, <code>inactive</code>.</p>" +
    "<h3>Synthesis</h3>" +
    "<p><code>A.samples(id, kind)</code> is a pure function, so tests check its envelopes headlessly. 22050 Hz mono; <i>u</i> runs 0..1 through the buffer.</p>" +
    "<div class=\"tbl-wrap\"><table><thead><tr><th>Kind</th><th>Length</th><th>Frequency</th></tr></thead><tbody>" +
    "<tr><td>shot</td><td>0.13 s</td><td><code>pitch &times; (1.4 &minus; 0.9u)</code></td></tr>" +
    "<tr><td>sweep</td><td>0.20 s</td><td>as shot, with heavy noise</td></tr>" +
    "<tr><td>hit</td><td>0.10 s</td><td><code>pitch &times; 0.7 &times; (1 &minus; 0.6u)</code></td></tr>" +
    "<tr><td>kill</td><td>0.28 s</td><td><code>pitch &times; 0.45 &times; (1 &minus; 0.65u)</code></td></tr>" +
    "<tr><td>tail</td><td>0.20 s</td><td><code>220 &times; (1 &minus; 0.8u)</code></td></tr>" +
    "<tr><td>hum</td><td>0.4 s loop</td><td><code>(sin 100 Hz + 0.3 sin 200 Hz) &times; (0.8 + 0.2 sin 5 Hz) &times; 0.22</code></td></tr>" +
    "</tbody></table></div>" +
    "<p>Sharp adds a second harmonic at 0.3. A noise \"grit\" (a Park&ndash;Miller generator seeded 73, so every buffer is identical) mixes in at 0.65 for Impact or any sweep, 0.22 otherwise. The envelope is a 3 ms attack into <code>(1 &minus; u)&sup3;</code>, gain 0.65. Each <code>family:kind</code> buffer is built once and cloned per play.</p>" +
    "<h3>Coalescing</h3>" +
    "<ol>" +
    "<li><b>Per target:</b> before a hit cue is even queued, each enemy allows one per payload family per 0.09 s, except a kill.</li>" +
    "<li><b>Per key:</b> a played <code>kind:id</code> blocks the same key for 0.045 s (shots) or 0.075 s (everything else).</li>" +
    "<li><b>Voices:</b> at most <code>audio.voices</code> = 16 playing at once; a request beyond that is dropped, not queued.</li>" +
    "</ol>" +
    "<p>Volume is <code>volume &times; group &times; min(1, power)</code>, where the group is <code>audio.shots</code> for shots and sweeps and <code>audio.hits</code> for the rest, and power is the strike's brightness (a split strike's third-share pellet is quieter).</p>" +
    "<h3>The plasma hum</h3>" +
    "<p>While any sustained strike carrying Plasma is alive, one looping hum plays outside the voice cap, its volume following the brightest contributor. When the last one ends, the hum stops and a tail plays, logged with the strikes that contributed.</p>" +
    "<h3>What was removed</h3>" +
    "<p>Under the old energy model a projectile could be paid for at launch and then run dry before its sound played, so a filter suppressed launch audio for strikes \"exhausted before playback\". The replacement model charges a projectile once in full, so it cannot exhaust, and the filter and its <code>strike_exhausted_before_playback</code> reason were deleted. Launch audio now simply follows funded starts.</p>",

  knobs: [
    ["Sound enabled", "on", "Master switch", "audio.enabled"],
    ["Master volume", "0.45", "Overall gain", "audio.volume"],
    ["Firing volume", "0.65", "Group gain for shots and sweeps", "audio.shots"],
    ["Hit / kill volume", "0.8", "Group gain for hits, kills, tails", "audio.hits"],
    ["Beam hum volume", "0.35", "Gain of the plasma hum", "audio.beams"],
    ["Simultaneous sounds", "16", "Voice cap", "audio.voices"],
    ["Key cooldown", "0.045 s / 0.075 s", "Hard-coded coalescing windows", "sound.lua play"],
  ],

  related: [
    { id: "hit-feedback", how: "Queues the requests and owns the per-target cooldown." },
    { id: "payloads", how: "Each family's pitch is its audio identity." },
    { id: "sustained-drain", how: "Sustained plasma strikes are what drive the hum." },
    { id: "live-inspection", how: "The event trace shows every suppressed sound and why." },
  ],

  questions: [
    "Should density change timbre instead of being discarded: many hits in a window become one louder, noisier hit?",
    "Static Field and Orbit Blades make no sound at all. Is silence part of why they feel weak?",
    "Should the coalescing windows be schema settings?",
  ],

  sparks: [
    "Coalescing as a mechanic: count the suppressed hits in a window and raise the pitch of the one that plays, so a combo is audible.",
    "A voice cap that is shared with enemies, so a loud enemy volley literally drowns out your weapons.",
    "Generate a family's whole sound set from one pitch number, so a designer adding a payload gets its voice for free.",
  ],

  terms: [
    { term: "Sound request", def: "A queued {kind, id, power} event from feedback.", code: "feedback.sound, run.feedback.sounds" },
    { term: "Sound voice", def: "One playing source; capped at audio.voices.", code: "sound.lua A.voices" },
    { term: "Coalescing", def: "Suppressing repeats of a key within a short window.", code: "A.cooldowns" },
    { term: "Hum", def: "The looping sound for live sustained plasma strikes.", code: "A.hum" },
  ],

  sources: [
    "playground:games/horde-survivor/sound.lua:9",
    "playground:games/horde-survivor/sound.lua:61",
    "playground:games/horde-survivor/sound.lua:78",
    "playground:games/horde-survivor/feedback.lua:18",
    "playground:games/horde-survivor/settings.lua:296",
    "playground:docs/Live_Inspection.md:84",
    "playground:docs/MWS_Implementation.md:237",
  ],

  toy: {
    title: "A volley, heard once",
    hint: "widen the window, shrink the voice cap",
    caption: "Exact cooldown and voice-cap rules and the exact synthesis formula (waveform, top right). Simplified: the scenarios generate requests on a fixed rhythm, all from different targets. Silent unless you press a play button.",
    w: 384, h: 216,
    controls: [
      { type: "select", key: "sc", label: "scenario", value: "volley", options: [["volley", "5-pellet volley, 0.95 s"], ["rapid", "repeater 20/s"], ["cull", "30 kills in 0.5 s"]] },
      { type: "range", key: "shotWin", label: "shot window", min: 0, max: 0.3, step: 0.005, value: 0.045, fmt: "{} s" },
      { type: "range", key: "otherWin", label: "other window", min: 0, max: 0.3, step: 0.005, value: 0.075, fmt: "{} s" },
      { type: "range", key: "voices", label: "voices", min: 1, max: 32, value: 16 },
      { type: "select", key: "fam", label: "family", value: "sharp", options: [["sharp", "Sharp 760"], ["impact", "Impact 150"], ["plasma", "Plasma 330"]] },
      { type: "button", label: "play shot", press(S, P) { S.play(P.fam, "shot"); } },
      { type: "button", label: "play kill", press(S, P) { S.play(P.fam, "kill"); } },
    ],
    init(S) {
      const PITCH = { sharp: 760, impact: 150, plasma: 330 }, DUR = { shot: 0.13, hit: 0.10, kill: 0.28 };
      S.samples = (id, kind, rate) => {
        const n = Math.floor(DUR[kind] * rate), out = new Float32Array(n), pitch = PITCH[id];
        let phase = 0, seed = 73;
        for (let i = 0; i < n; i++) {
          seed = (seed * 16807) % 2147483647;
          const noise = seed / 2147483647 * 2 - 1, t = i / rate, u = i / (n - 1);
          let f = pitch * (1.4 - u * 0.9);
          if (kind === "hit") f = pitch * 0.7 * (1 - u * 0.6); else if (kind === "kill") f = pitch * 0.45 * (1 - u * 0.65);
          phase += f / rate;
          let tone = Math.sin(2 * Math.PI * phase);
          const grit = id === "impact" ? 0.65 : 0.22;
          if (id === "sharp") tone = 0.7 * tone + 0.3 * Math.sin(4 * Math.PI * phase);
          out[i] = ((1 - grit) * tone + grit * noise) * Math.min(1, t / 0.003) * Math.pow(1 - u, 3) * 0.65;
        }
        return out;
      };
      S.play = (id, kind) => {
        if (typeof AudioContext === "undefined") return;
        try {
          S.ac = S.ac || new AudioContext();
          const data = S.samples(id, kind, 22050), buf = S.ac.createBuffer(1, data.length, 22050);
          buf.getChannelData(0).set(data);
          const src = S.ac.createBufferSource(), gain = S.ac.createGain();
          gain.gain.value = 0.45 * (kind === "shot" ? 0.65 : 0.8);
          src.buffer = buf; src.connect(gain); gain.connect(S.ac.destination); src.start();
        } catch (e) { /* audio is optional */ }
      };
      Object.assign(S, { t: 0, next: 0.2, ev: [], voices: [], cool: {}, vtrace: [], n: { played: 0, cool: 0, voice: 0 }, DUR });
      S.wave = S.samples("sharp", "shot", 4000); S.waveFam = "sharp";
    },
    update(S, P, dt) {
      S.t += dt;
      if (S.waveFam !== P.fam) { S.wave = S.samples(P.fam, "shot", 4000); S.waveFam = P.fam; }
      const req = [];
      while (S.t >= S.next) {
        const at = S.next;
        if (P.sc === "volley") { for (let i = 0; i < 5; i++) { req.push(["shot", at]); req.push(["hit", at + 0.2 + i * 0.004]); } S.next += 0.95; }
        else if (P.sc === "rapid") { req.push(["shot", at]); req.push(["hit", at + 0.15]); S.next += 0.05; }
        else { for (let i = 0; i < 30; i++) req.push(["kill", at + i * 0.5 / 30]); S.next += 2; }
      }
      for (const r of req) S.ev.push({ kind: r[0], t: r[1], state: "pending" });
      S.voices = S.voices.filter((v) => v > S.t);
      for (const e of S.ev) {
        if (e.state !== "pending" || e.t > S.t) continue;
        const key = e.kind + ":" + P.fam;
        if ((S.cool[key] || 0) > S.t) { e.state = "cool"; S.n.cool++; }
        else if (S.voices.length >= P.voices) { e.state = "voice"; S.n.voice++; }
        else { S.cool[key] = S.t + (e.kind === "shot" ? P.shotWin : P.otherWin); e.state = "played"; S.n.played++; S.voices.push(S.t + S.DUR[e.kind]); }
      }
      S.ev = S.ev.filter((e) => e.t > S.t - 3);
      S.vtrace.push(S.voices.length); if (S.vtrace.length > 180) S.vtrace.shift();
    },
    draw(g, S, P) {
      const C = g.C; g.clear();
      const x0 = 46, w = 330, lanes = ["shot", "hit", "kill"], ly = { shot: 68, hit: 96, kill: 124 };
      const X = (t) => x0 + (t - (S.t - 3)) / 3 * w;
      for (const k of lanes) { g.line(x0, ly[k], x0 + w, ly[k], C.rule); g.label(k.toUpperCase(), 8, ly[k] + 3, C.ink2); }
      for (const e of S.ev) {
        if (e.state === "pending") continue;
        const x = X(e.t), y = ly[e.kind];
        if (e.state === "played") { g.rect(x, y - 9, Math.max(1, S.DUR[e.kind] / 3 * w), 4, C.accent); g.line(x, y - 10, x, y + 2, C.ink, 1.5); }
        else g.line(x, y - 4, x, y + 4, e.state === "cool" ? C.enemy : C.violet, 1);
      }
      // voice count
      const vy = 146, vh = 40;
      g.tone(x0, vy, w, vh, 0.06, C.ink3);
      g.line(x0, vy + vh - P.voices / 32 * vh, x0 + w, vy + vh - P.voices / 32 * vh, C.violet, 1, [3, 3]);
      g.plot(x0, vy, w * S.vtrace.length / 180, vh, S.vtrace.map((v) => v / 32), C.accent, 1);
      g.label("VOICES", 8, vy + 22, C.ink2);
      g.label("PLAYED", x0, 204, C.accent); g.label("COOLDOWN", x0 + 60, 204, C.enemy); g.label("VOICE CAP", x0 + 136, 204, C.violet);
      // waveform of the selected family's shot
      const wx = 246, wy = 12, ww = 130, wh = 30;
      g.rect(wx, wy, ww, wh, C.rule, 1);
      const pts = []; for (let i = 0; i < S.wave.length; i += 2) pts.push([wx + i / S.wave.length * ww, wy + wh / 2 - S.wave[i] * wh * 0.7]);
      g.poly(pts, C.sky, 1, false);
      g.label(P.fam.toUpperCase() + " SHOT 0.13 S", wx + 2, wy + wh + 9, C.ink3);
    },
    readout(S) { return "played " + S.n.played + "\ncooldown " + S.n.cool + "  voice cap " + S.n.voice; },
  },
});
