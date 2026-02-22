// Ported subset of prebake functions from switchangel/strudel-scripts
// Evaluated as strings via repl.evaluate() after initStrudel()

// NOTE: fill must be registered before tgate (tgate calls .fill())
export const REGISTERED_FUNCTIONS = `
// fill — extend events to fill gaps between onsets
register('fill', function (pat) {
  return new Pattern(function (state) {
    const lookbothways = 1;
    const haps = pat.query(state.withSpan(span => new TimeSpan(span.begin.sub(lookbothways), span.end.add(lookbothways))));
    const onsets = haps.map(hap => hap.whole.begin)
      .sort((a, b) => a.compare(b))
      .filter((x, i, arr) => i == (arr.length - 1) || x.ne(arr[i + 1]));
    const newHaps = [];
    for (const hap of haps) {
      if (hap.part.begin.gte(state.span.end)) continue;
      const next = onsets.find(onset => onset.gte(hap.whole.end));
      if (next === undefined) continue;
      if (next.lte(state.span.begin)) continue;
      const whole = new TimeSpan(hap.whole.begin, next);
      const part = new TimeSpan(hap.part.begin.max(state.span.begin), next.min(state.span.end));
      newHaps.push(new Hap(whole, part, hap.value, hap.context, hap.stateful));
    }
    return newHaps;
  });
});

// acidenv — TB-303 style filter envelope (0-1 range)
register('acidenv', (x, pat) =>
  pat.lpf(100).lpenv(reify(x).mul(9)).lps(.2).lpd(.12).lpq(2)
);

// acid — supersaw with filter envelope and resonance
register('acid', (pat) =>
  pat.s('supersaw').detune(.5).unison(1)
    .lpf(100).lpsustain(0.2).lpd(.2).lpenv(2).lpq(12)
);

// rlpf — normalized 0-1 low-pass filter (exponential mapping)
register('rlpf', (x, pat) =>
  pat.lpf(pure(x).mul(12).pow(4))
);

// rhpf — normalized 0-1 high-pass filter (exponential mapping)
register('rhpf', (x, pat) =>
  pat.hpf(pure(x).mul(12).pow(4))
);

// dly — delay with feedback, increasing delay increases feedback
register('dly', (amt, pat) => {
  amt = reify(amt);
  return pat.delay(amt.mul(.8)).delayfeedback(amt.pow(2)).mask(amt.floor().inv());
});

// tgate — trancegate with density control (depends on fill)
register('tgate', (amt, pat) => {
  amt = reify(amt);
  return pat.struct("x!16".degradeBy(amt.mul(-1).add(1))).fill().clip(.7);
});

// humanize — timing jitter + velocity randomization
register('humanize', (amt, pat) => {
  const amtC = clamp(amt, 0, 1);
  return pat.withHaps((haps) => {
    return haps.map((hap) => {
      const offset = 0.1 * amtC * (2 * Math.random() - 1);
      return hap.withSpan((span) => span.withTime(t => t + offset));
    });
  }).withValue((v) => ({ ...v, velocity: (v.velocity ?? 1) + 0.5 * amtC * (2 * Math.random() - 1) }));
});

// pad — warm sawtooth pad with slow ADSR
register('pad', (pat) =>
  pat.s('sawtooth').attack(.3).decay(.8).sustain(.6).release(.5)
    .lpf(1800).lpq(1).detune(4)
);

// softacid — tamed acid bass (lower resonance than acid)
register('softacid', (pat) =>
  pat.s('supersaw').detune(.3).unison(1)
    .lpf(200).lpsustain(0.15).lpd(.25).lpenv(1.5).lpq(4)
);

// shimmer — combined reverb + delay for atmosphere (0-1)
register('shimmer', (amt, pat) => {
  amt = reify(amt);
  return pat.room(amt).roomsize(amt.mul(6)).delay(amt.mul(.4))
    .delayfeedback(amt.mul(.3)).delaytime(amt.mul(.15));
});
`;

export const WINDOW_FUNCTIONS = `
// dx — FM synthesis preset
register('dx', (env, fm, harm, pat) =>
  pat.s('sine').fm(fm).fmenv(env).fmh(harm).fmdecay(.2)
);

// noisehat — noise hi-hat with modulated decay
window.noisehat = function(seg, speed, min, max) {
  seg = seg || 16;
  speed = speed || 4;
  min = min || .05;
  max = max || .12;
  return s('white').seg(seg).dec(tri.fast(speed).range(min, max));
};
`;
