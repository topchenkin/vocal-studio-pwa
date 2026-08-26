export type VocalFxPreset =
  | "original"
  | "booth"
  | "hall"
  | "church"
  | "chapel"
  | "plate"
  | "chamber"
  | "bathroom"
  | "street"
  | "alley"
  | "tunnel"
  | "stadium"
  | "club"
  | "jazzclub"
  | "radio"
  | "phone"
  | "megaphone"
  | "walkie"
  | "double"
  | "vocoder"
  | "slapback"
  | "gated80s"
  | "tape"
  | "cassette"
  | "vinyl"
  | "underwater"
  | "cave"
  | "robot"
  | "choir"
  | "shimmer"
  | "broadcast";

export const VOCAL_FX_PRESETS: Array<{
  id: VocalFxPreset;
  label: string;
  hint: string;
  group: string;
}> = [
  { id: "original", label: "Оригинал", hint: "Чистый голос без обработки", group: "Студия" },
  { id: "booth", label: "Студийная кабина", hint: "Плотный близкий вокал с короткой комнатой", group: "Студия" },
  { id: "broadcast", label: "Подкаст / эфир", hint: "Речь как на радио: компрессия и присутствие", group: "Студия" },
  { id: "hall", label: "Концертный зал", hint: "Глубокий реверб и блеск верха", group: "Пространство" },
  { id: "church", label: "Церковь / собор", hint: "Длинный тёмный хвост, как под сводами", group: "Пространство" },
  { id: "chapel", label: "Часовня", hint: "Средний храм: воздух и мягкое эхо", group: "Пространство" },
  { id: "plate", label: "Винтажная пластина", hint: "Классический EMT-plate для поп-вокала", group: "Пространство" },
  { id: "chamber", label: "Камерный зал", hint: "Короткая студийная камера", group: "Пространство" },
  { id: "bathroom", label: "Ванная", hint: "Кафель: короткий яркий реверб", group: "Пространство" },
  { id: "cave", label: "Пещера", hint: "Тёмные отражения и низкое эхо", group: "Пространство" },
  { id: "stadium", label: "Стадион", hint: "Огромная арена и поздний слэп", group: "Пространство" },
  { id: "street", label: "Улица", hint: "Открытый воздух, короткий слэп от стен", group: "Город" },
  { id: "alley", label: "Переулок", hint: "Узкий двор, более длинное эхо", group: "Город" },
  { id: "tunnel", label: "Тоннель метро", hint: "Глухое эхо в трубе", group: "Город" },
  { id: "club", label: "Ночной клуб", hint: "Тёмный зал, плотный низ и компрессия", group: "Город" },
  { id: "jazzclub", label: "Джаз-клуб", hint: "Тёплый деревянный зал", group: "Город" },
  { id: "radio", label: "Винтажное радио", hint: "Узкий диапазон и ламповая сатурация", group: "Связь и ретро" },
  { id: "phone", label: "Телефон", hint: "Как будто звоните с мобильного", group: "Связь и ретро" },
  { id: "megaphone", label: "Мегафон", hint: "Уличный рупор, резкий и громкий", group: "Связь и ретро" },
  { id: "walkie", label: "Рация", hint: "Рация / домофон, хрип и узкая полоса", group: "Связь и ретро" },
  { id: "vinyl", label: "Грампластинка", hint: "Тёплый винил и лёгкий треск", group: "Связь и ретро" },
  { id: "cassette", label: "Кассета Lo-fi", hint: "Плёнка, шевеление и закрытый верх", group: "Связь и ретро" },
  { id: "tape", label: "Ленточная задержка", hint: "Аналоговый echo, как у рок-баллад", group: "Связь и ретро" },
  { id: "slapback", label: "Слэпбэк (Элвис)", hint: "Короткий рокабильный повтор ~130 мс", group: "Характер" },
  { id: "gated80s", label: "Гейт 80-х", hint: "Короткий яркий хвост в духе Phil Collins", group: "Характер" },
  { id: "double", label: "Дабл-трек", hint: "Левый сухой, правый с задержкой и detune", group: "Характер" },
  { id: "choir", label: "Хоровой ореол", hint: "Хор за плечом: chorus + зал", group: "Характер" },
  { id: "shimmer", label: "Шиммер", hint: "Воздушный хвост с блеском октавы", group: "Характер" },
  { id: "vocoder", label: "Космический вокодер", hint: "Кольцевая модуляция 60–120 Гц", group: "Эксперименты" },
  { id: "robot", label: "Робот", hint: "Биткраш и модуляция, как у автомата", group: "Эксперименты" },
  { id: "underwater", label: "Под водой", hint: "Глухой низ и пузырящееся эхо", group: "Эксперименты" },
];

type ShapeKind = "soft" | "hard" | "tape" | "bit" | "fuzz";

type FxRecipe = {
  hpf?: number;
  lpf?: number;
  peaks?: Array<{ freq: number; q?: number; gain: number }>;
  shelves?: Array<{ type: "highshelf" | "lowshelf"; freq: number; gain: number }>;
  bandpass?: { freq: number; q: number };
  shape?: ShapeKind;
  delayMs?: number;
  delayFb?: number;
  delayLp?: number;
  reverbSec?: number;
  reverbDecay?: number;
  reverbBright?: number;
  preDelayMs?: number;
  chorus?: boolean;
  flanger?: boolean;
  phaser?: boolean;
  tremoloHz?: number;
  tremoloDepth?: number;
  ringHz?: number;
  ringType?: OscillatorType;
  double?: boolean;
  compress?: boolean;
  crackle?: number;
  makeup?: number;
};

const RECIPES: Record<Exclude<VocalFxPreset, "original">, FxRecipe> = {
  booth: {
    hpf: 80,
    peaks: [{ freq: 3500, gain: 2.5, q: 0.9 }],
    reverbSec: 0.38,
    reverbDecay: 3.2,
    makeup: 0.95,
  },
  hall: {
    reverbSec: 3.5,
    reverbDecay: 2.8,
    shelves: [{ type: "highshelf", freq: 4000, gain: 3 }],
    makeup: 0.9,
  },
  church: {
    hpf: 110,
    lpf: 6200,
    reverbSec: 5.6,
    reverbDecay: 2.2,
    reverbBright: 0.28,
    preDelayMs: 48,
    makeup: 0.82,
  },
  chapel: {
    hpf: 90,
    reverbSec: 2.7,
    reverbDecay: 2.5,
    reverbBright: 0.55,
    preDelayMs: 28,
    shelves: [{ type: "highshelf", freq: 5000, gain: 2 }],
    makeup: 0.88,
  },
  plate: {
    hpf: 180,
    reverbSec: 2.15,
    reverbDecay: 2.4,
    reverbBright: 0.85,
    shelves: [{ type: "highshelf", freq: 6500, gain: 4 }],
    makeup: 0.9,
  },
  chamber: {
    peaks: [{ freq: 220, gain: -2, q: 0.8 }],
    reverbSec: 1.55,
    reverbDecay: 2.6,
    reverbBright: 0.5,
    makeup: 0.92,
  },
  bathroom: {
    peaks: [{ freq: 850, gain: 3.5, q: 1.4 }],
    shelves: [{ type: "highshelf", freq: 4200, gain: 6 }],
    reverbSec: 0.72,
    reverbDecay: 1.8,
    reverbBright: 0.95,
    makeup: 0.95,
  },
  street: {
    hpf: 200,
    lpf: 8500,
    delayMs: 92,
    delayFb: 0.14,
    reverbSec: 0.85,
    reverbDecay: 2.8,
    reverbBright: 0.35,
    makeup: 0.9,
  },
  alley: {
    hpf: 170,
    delayMs: 145,
    delayFb: 0.22,
    delayLp: 4200,
    reverbSec: 1.25,
    reverbDecay: 2.4,
    reverbBright: 0.3,
    makeup: 0.88,
  },
  tunnel: {
    hpf: 140,
    lpf: 2400,
    delayMs: 230,
    delayFb: 0.38,
    delayLp: 1100,
    reverbSec: 2.6,
    reverbDecay: 2.1,
    reverbBright: 0.15,
    makeup: 0.85,
  },
  stadium: {
    delayMs: 168,
    delayFb: 0.12,
    reverbSec: 4.3,
    reverbDecay: 2.3,
    preDelayMs: 62,
    lpf: 7200,
    makeup: 0.84,
  },
  club: {
    hpf: 70,
    peaks: [{ freq: 90, gain: 3.5, q: 0.7 }],
    lpf: 9000,
    reverbSec: 1.15,
    reverbDecay: 2.6,
    reverbBright: 0.25,
    compress: true,
    makeup: 1.05,
  },
  jazzclub: {
    shelves: [{ type: "lowshelf", freq: 220, gain: 2 }],
    peaks: [{ freq: 420, gain: -2, q: 0.8 }],
    lpf: 10500,
    reverbSec: 1.4,
    reverbDecay: 2.5,
    reverbBright: 0.4,
    makeup: 0.92,
  },
  radio: {
    bandpass: { freq: 1200, q: 3 },
    shape: "soft",
    makeup: 1.35,
  },
  phone: {
    hpf: 420,
    lpf: 3100,
    bandpass: { freq: 1750, q: 3.6 },
    shape: "hard",
    makeup: 1.4,
  },
  megaphone: {
    bandpass: { freq: 1350, q: 2.1 },
    shelves: [{ type: "highshelf", freq: 2800, gain: 4 }],
    shape: "fuzz",
    makeup: 1.25,
  },
  walkie: {
    bandpass: { freq: 2050, q: 5 },
    lpf: 3400,
    shape: "bit",
    makeup: 1.3,
  },
  double: { double: true, makeup: 0.95 },
  vocoder: { ringHz: 80, ringType: "sine", makeup: 1.1 },
  slapback: { delayMs: 128, delayFb: 0.07, makeup: 0.95 },
  gated80s: {
    reverbSec: 0.42,
    reverbDecay: 10,
    reverbBright: 0.9,
    shelves: [{ type: "highshelf", freq: 5200, gain: 3 }],
    compress: true,
    makeup: 1.05,
  },
  tape: {
    delayMs: 390,
    delayFb: 0.34,
    delayLp: 2400,
    shape: "tape",
    chorus: true,
    makeup: 0.92,
  },
  cassette: {
    hpf: 170,
    lpf: 4300,
    shape: "tape",
    tremoloHz: 0.45,
    tremoloDepth: 0.1,
    crackle: 0.018,
    makeup: 1.05,
  },
  vinyl: {
    hpf: 240,
    lpf: 5400,
    peaks: [{ freq: 380, gain: -3, q: 0.7 }],
    crackle: 0.045,
    tremoloHz: 0.65,
    tremoloDepth: 0.07,
    makeup: 1.02,
  },
  underwater: {
    lpf: 620,
    delayMs: 85,
    delayFb: 0.28,
    reverbSec: 2.1,
    reverbDecay: 2.4,
    chorus: true,
    makeup: 1.1,
  },
  cave: {
    hpf: 90,
    delayMs: 285,
    delayFb: 0.3,
    delayLp: 780,
    reverbSec: 4.9,
    reverbDecay: 2.0,
    reverbBright: 0.12,
    makeup: 0.86,
  },
  robot: {
    lpf: 5200,
    shape: "bit",
    ringHz: 92,
    ringType: "square",
    makeup: 1.15,
  },
  choir: {
    chorus: true,
    reverbSec: 2.75,
    reverbDecay: 2.5,
    shelves: [{ type: "highshelf", freq: 4200, gain: 2 }],
    makeup: 0.9,
  },
  shimmer: {
    chorus: true,
    delayMs: 95,
    delayFb: 0.18,
    reverbSec: 3.7,
    reverbDecay: 2.3,
    reverbBright: 0.92,
    shelves: [{ type: "highshelf", freq: 6500, gain: 6 }],
    makeup: 0.88,
  },
  broadcast: {
    hpf: 80,
    peaks: [{ freq: 3100, gain: 4, q: 0.85 }],
    compress: true,
    reverbSec: 0.22,
    reverbDecay: 3.4,
    makeup: 1.08,
  },
};

export function clampWet(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

export function makeReverbImpulse(
  ctx: BaseAudioContext,
  seconds = 3.5,
  decayPow = 2.8,
  brightness = 0.55
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const bright = Math.max(0.05, Math.min(1, brightness));
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      const decay = Math.pow(1 - i / length, decayPow);
      const noise = (Math.random() * 2 - 1) * decay;
      lp += (noise - lp) * (0.12 + bright * 0.72);
      data[i] = lp;
    }
  }
  return impulse;
}

function makeCurve(kind: ShapeKind, samples = 1024): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    if (kind === "soft") curve[i] = Math.tanh(2.4 * x);
    else if (kind === "hard") curve[i] = Math.tanh(6 * x);
    else if (kind === "tape") curve[i] = x - (x * x * x) / 3;
    else if (kind === "fuzz") curve[i] = Math.tanh(8 * x) * 0.92;
    else {
      const steps = 12;
      curve[i] = Math.round(x * steps) / steps;
    }
  }
  return curve;
}

function makeCrackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 1.8));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    if (Math.random() < 0.0018) data[i] = (Math.random() * 2 - 1) * 0.7;
    else if (Math.random() < 0.018) data[i] = (Math.random() * 2 - 1) * 0.04;
  }
  return buffer;
}

type StopHandle = { stop: () => void };

class FxGraph {
  readonly nodes: AudioNode[] = [];
  readonly oscs: OscillatorNode[] = [];
  readonly sources: AudioBufferSourceNode[] = [];

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  stop(): void {
    for (const osc of this.oscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const node of [...this.oscs, ...this.sources, ...this.nodes]) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}

function setCurve(shaper: WaveShaperNode, curve: Float32Array): void {
  (shaper as unknown as { curve: Float32Array }).curve = curve;
}

function connectRecipe(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  recipe: FxRecipe
): StopHandle {
  const graph = new FxGraph();
  let head: AudioNode = input;

  const plug = <T extends AudioNode>(node: T): T => {
    head.connect(node);
    graph.add(node);
    head = node;
    return node;
  };

  if (recipe.hpf) {
    const hp = plug(ctx.createBiquadFilter());
    hp.type = "highpass";
    hp.frequency.value = recipe.hpf;
    hp.Q.value = 0.7;
  }
  if (recipe.lpf) {
    const lp = plug(ctx.createBiquadFilter());
    lp.type = "lowpass";
    lp.frequency.value = recipe.lpf;
    lp.Q.value = 0.7;
  }
  for (const peak of recipe.peaks ?? []) {
    const filter = plug(ctx.createBiquadFilter());
    filter.type = "peaking";
    filter.frequency.value = peak.freq;
    filter.Q.value = peak.q ?? 1;
    filter.gain.value = peak.gain;
  }
  for (const shelf of recipe.shelves ?? []) {
    const filter = plug(ctx.createBiquadFilter());
    filter.type = shelf.type;
    filter.frequency.value = shelf.freq;
    filter.gain.value = shelf.gain;
  }
  if (recipe.bandpass) {
    const band = plug(ctx.createBiquadFilter());
    band.type = "bandpass";
    band.frequency.value = recipe.bandpass.freq;
    band.Q.value = recipe.bandpass.q;
  }
  if (recipe.shape) {
    const shaper = plug(ctx.createWaveShaper());
    setCurve(shaper, makeCurve(recipe.shape));
    shaper.oversample = "2x";
  }
  if (recipe.compress) {
    const comp = plug(ctx.createDynamicsCompressor());
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.008;
    comp.release.value = 0.16;
  }

  const mix = graph.add(ctx.createGain());
  mix.gain.value = 1;
  const additive = Boolean(
    recipe.delayMs ||
      recipe.reverbSec ||
      recipe.chorus ||
      recipe.flanger ||
      recipe.phaser
  );
  const dryTap = graph.add(ctx.createGain());
  dryTap.gain.value = recipe.double ? 0.7 : additive ? 0.38 : 1;
  head.connect(dryTap);
  dryTap.connect(mix);

  if (recipe.double) {
    dryTap.gain.value = 0.7;
    const delay = graph.add(ctx.createDelay(0.2));
    delay.delayTime.value = 0.025;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = graph.add(ctx.createGain());
    lfoGain.gain.value = 0.004;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    graph.oscs.push(lfo);
    lfo.start();
    const panDry = graph.add(ctx.createStereoPanner());
    panDry.pan.value = -0.7;
    const panWet = graph.add(ctx.createStereoPanner());
    panWet.pan.value = 0.75;
    dryTap.disconnect();
    dryTap.connect(panDry);
    panDry.connect(mix);
    head.connect(delay);
    delay.connect(panWet);
    panWet.connect(mix);
  }

  if (recipe.delayMs) {
    const delay = graph.add(ctx.createDelay(1.5));
    delay.delayTime.value = recipe.delayMs / 1000;
    const fb = graph.add(ctx.createGain());
    fb.gain.value = recipe.delayFb ?? 0.2;
    head.connect(delay);
    if (recipe.delayLp) {
      const lp = graph.add(ctx.createBiquadFilter());
      lp.type = "lowpass";
      lp.frequency.value = recipe.delayLp;
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(mix);
    } else {
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(mix);
    }
  }

  if (recipe.reverbSec) {
    const pre = graph.add(ctx.createDelay(0.2));
    pre.delayTime.value = (recipe.preDelayMs ?? 0) / 1000;
    const convolver = graph.add(ctx.createConvolver());
    convolver.buffer = makeReverbImpulse(
      ctx,
      recipe.reverbSec,
      recipe.reverbDecay ?? 2.6,
      recipe.reverbBright ?? 0.55
    );
    const wet = graph.add(ctx.createGain());
    wet.gain.value = 0.85;
    head.connect(pre);
    pre.connect(convolver);
    convolver.connect(wet);
    wet.connect(mix);
  }

  if (recipe.chorus || recipe.flanger) {
    const times = recipe.flanger ? [0.0035] : [0.014, 0.023];
    times.forEach((time, index) => {
      const delay = graph.add(ctx.createDelay(0.05));
      delay.delayTime.value = time;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = recipe.flanger ? 0.35 : 0.22 + index * 0.11;
      const depth = graph.add(ctx.createGain());
      depth.gain.value = recipe.flanger ? 0.0022 : 0.0035;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      graph.oscs.push(lfo);
      lfo.start();
      const voice = graph.add(ctx.createGain());
      voice.gain.value = recipe.flanger ? 0.55 : 0.32;
      const pan = graph.add(ctx.createStereoPanner());
      pan.pan.value = times.length === 1 ? 0 : index === 0 ? -0.55 : 0.55;
      head.connect(delay);
      delay.connect(voice);
      voice.connect(pan);
      pan.connect(mix);
    });
  }

  if (recipe.phaser) {
    let phaserHead: AudioNode = head;
    const stages = [400, 800, 1600, 3200];
    stages.forEach((freq, index) => {
      const allpass = graph.add(ctx.createBiquadFilter());
      allpass.type = "allpass";
      allpass.frequency.value = freq;
      allpass.Q.value = 1.2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.18 + index * 0.04;
      const depth = graph.add(ctx.createGain());
      depth.gain.value = freq * 0.35;
      lfo.connect(depth);
      depth.connect(allpass.frequency);
      graph.oscs.push(lfo);
      lfo.start();
      phaserHead.connect(allpass);
      phaserHead = allpass;
    });
    phaserHead.connect(mix);
  }

  if (recipe.tremoloHz) {
    const trem = graph.add(ctx.createGain());
    trem.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = recipe.tremoloHz;
    const depth = graph.add(ctx.createGain());
    depth.gain.value = recipe.tremoloDepth ?? 0.1;
    const base = graph.add(ctx.createGain());
    base.gain.value = 1 - (recipe.tremoloDepth ?? 0.1);
    mix.connect(base);
    base.connect(trem);
    lfo.connect(depth);
    depth.connect(trem.gain);
    graph.oscs.push(lfo);
    lfo.start();
    head = trem;
  } else {
    head = mix;
  }

  if (recipe.ringHz) {
    const depth = graph.add(ctx.createGain());
    depth.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = recipe.ringType ?? "sine";
    osc.frequency.value = recipe.ringHz;
    const oscGain = graph.add(ctx.createGain());
    oscGain.gain.value = 1;
    osc.connect(oscGain);
    oscGain.connect(depth.gain);
    graph.oscs.push(osc);
    osc.start();
    head.connect(depth);
    head = depth;
  }

  if (recipe.crackle) {
    const noise = ctx.createBufferSource();
    noise.buffer = makeCrackleBuffer(ctx);
    noise.loop = true;
    const gain = graph.add(ctx.createGain());
    gain.gain.value = recipe.crackle;
    noise.connect(gain);
    gain.connect(mix);
    graph.sources.push(noise);
    noise.start();
  }

  const makeup = graph.add(ctx.createGain());
  makeup.gain.value = recipe.makeup ?? 1;
  head.connect(makeup);
  makeup.connect(output);

  return { stop: () => graph.stop() };
}

export function connectVocalFx(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  preset: VocalFxPreset,
  wet: number
): StopHandle {
  const mixWet = ctx.createGain();
  const mixDry = ctx.createGain();
  const amount = preset === "original" ? 0 : clampWet(wet);
  mixWet.gain.value = amount;
  mixDry.gain.value = 1 - amount;
  input.connect(mixDry);
  mixDry.connect(output);

  if (preset === "original") {
    return {
      stop: () => {
        mixDry.disconnect();
        mixWet.disconnect();
        try {
          input.disconnect(mixDry);
        } catch {
          /* already disconnected */
        }
      },
    };
  }

  const fxIn = ctx.createGain();
  fxIn.gain.value = 1;
  input.connect(fxIn);
  const fx = connectRecipe(ctx, fxIn, mixWet, RECIPES[preset]);
  mixWet.connect(output);
  return {
    stop: () => {
      fx.stop();
      fxIn.disconnect();
      mixWet.disconnect();
      mixDry.disconnect();
      try {
        input.disconnect(mixDry);
      } catch {
        /* already disconnected */
      }
      try {
        input.disconnect(fxIn);
      } catch {
        /* already disconnected */
      }
    },
  };
}

export function copyBufferToContext(
  ctx: BaseAudioContext,
  buffer: AudioBuffer
): AudioBuffer {
  const copy = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    copy.getChannelData(channel).set(buffer.getChannelData(channel));
  }
  return copy;
}

function getOfflineCtor(): typeof OfflineAudioContext {
  const ctor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (
          window as unknown as {
            webkitOfflineAudioContext: typeof OfflineAudioContext;
          }
        ).webkitOfflineAudioContext;
  if (!ctor) throw new Error("OfflineAudioContext недоступен");
  return ctor;
}

export async function renderVocalFxWav(
  buffer: AudioBuffer,
  preset: VocalFxPreset,
  wet: number
): Promise<AudioBuffer> {
  const Offline = getOfflineCtor();
  const ctx = new Offline(2, buffer.length, buffer.sampleRate);
  const local = copyBufferToContext(ctx, buffer);
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = local;
  source.connect(input);
  source.start(0);
  const handle = connectVocalFx(ctx, input, output, preset, wet);
  const rendered = await ctx.startRendering();
  handle.stop();
  return rendered;
}

export function vocalFxFileSlug(preset: VocalFxPreset): string {
  return VOCAL_FX_PRESETS.find((item) => item.id === preset)?.label
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || preset;
}
