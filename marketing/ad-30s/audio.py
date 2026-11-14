# Copyright 2026 Cairn Contributors
# SPDX-License-Identifier: Apache-2.0
"""Cairn 30s ad — procedural soundtrack (120 BPM, A minor → C major), synced to index.html timeline."""
import os

import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
BEAT = 0.5

mus = np.zeros((2, N))   # music bus (sidechained)
drm = np.zeros((2, N))   # drums
sfx = np.zeros((2, N))   # sfx
rev = np.zeros((2, N))   # reverb send


def mf(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def put(bus, sig, t, g=1.0, pan=0.0, r=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    s = sig
    if i < 0:
        s = s[-i:]
        i = 0
    s = s[: N - i] * g
    gl = np.sqrt((1 - pan) / 2) * 1.4142
    gr = np.sqrt((1 + pan) / 2) * 1.4142
    bus[0, i:i + len(s)] += s * gl
    bus[1, i:i + len(s)] += s * gr
    if r:
        rev[0, i:i + len(s)] += s * gl * r
        rev[1, i:i + len(s)] += s * gr * r


def bq(sig, kind, f, order=2):
    f = np.clip(np.atleast_1d(f), 20, SR / 2 - 100)
    f = float(f[0]) if kind in ('lowpass', 'highpass') else list(f)
    sos = sg.butter(order, f, btype=kind, fs=SR, output='sos')
    return sg.sosfilt(sos, sig)


def onepole_sweep(x, f0, f1, curve=2.0):
    """time-varying lowpass (one-pole) sweeping f0→f1"""
    n = len(x)
    fc = f0 + (f1 - f0) * np.linspace(0, 1, n) ** curve
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty(n)
    z = 0.0
    for k in range(n):
        z = (1 - a[k]) * x[k] + a[k] * z
        y[k] = z
    return y


def noise(d):
    return rng.standard_normal(int(d * SR))


def saw(f, t, detune_cents=(0,)):
    out = np.zeros_like(t)
    for c in detune_cents:
        ff = f * 2 ** (c / 1200)
        ph = rng.random()
        out += 2 * ((t * ff + ph) % 1.0) - 1
    return out / len(detune_cents)


# ---------------------------------------------------------------- instruments
def kick(big=False):
    t = tt(0.6 if big else 0.42)
    f = 44 + (130 if big else 110) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t * (4.5 if big else 7.5))
    click = bq(noise(len(t) / SR), 'highpass', 1500) * np.exp(-t * 350) * 0.35
    return np.tanh(1.6 * (np.sin(ph) * env + click))


def clap():
    d = tt(0.35)
    x = np.zeros(len(d))
    nz = bq(noise(0.35), 'bandpass', [900, 3200])
    for k, o in enumerate([0, 0.011, 0.022]):
        i = int(o * SR)
        x[i:] += nz[: len(x) - i] * np.exp(-(d[: len(x) - i]) * (140 if k < 2 else 16))
    return x * 0.8


def hat(open_=False):
    d = tt(0.28 if open_ else 0.06)
    return bq(noise(len(d) / SR), 'highpass', 7500) * np.exp(-d * (14 if open_ else 70))


def thock():
    """stone landing: woody knock + low thump"""
    t = tt(0.5)
    f = 150 + 120 * np.exp(-t * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    knock = bq(noise(0.5), 'bandpass', [1400, 3800]) * np.exp(-t * 90) * 0.9
    sub = np.sin(2 * np.pi * 52 * t) * np.exp(-t * 9) * 0.8
    return np.tanh(1.3 * (body + knock + sub))


def impact(size=1.0):
    t = tt(2.6)
    f = 28 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crash = bq(noise(2.6), 'bandpass', [300, 7000]) * np.exp(-t * 3.6) * 0.2
    hit = bq(noise(2.6), 'lowpass', 2500) * np.exp(-t * 18) * 0.8
    return np.tanh((boom * 1.2 + crash + hit) * size)


def whoosh(d=0.5, up=True, bright=1.0):
    x = noise(d)
    tt_ = tt(d)
    env = np.sin(np.pi * np.clip(tt_ / d, 0, 1)) ** (1.4 if up else 0.8)
    if not up:
        env = np.exp(-tt_ / d * 3) * np.clip(tt_ / 0.02, 0, 1)
    y = onepole_sweep(x, 300 * bright, 6000 * bright, 1.2) if up else onepole_sweep(x, 7000 * bright, 400, 0.6)
    return bq(y * env, 'highpass', 150) * 1.6


def riser(d):
    t = tt(d)
    p = t / d
    nz = onepole_sweep(noise(d), 200, 9000, 2.2) * p ** 2.2
    f = 180 * 2 ** (p * 3.2)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * p ** 2 * 0.35 * (0.7 + 0.3 * np.sin(2 * np.pi * (4 + 18 * p) * t))
    return (nz * 0.9 + tone) * 0.8


def pop(f=700, d=0.09):
    t = tt(d)
    fr = f * (1 + 0.8 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 45) * np.clip(t / 0.002, 0, 1)


def tick():
    t = tt(0.03)
    return (bq(noise(0.03), 'highpass', 3000) * np.exp(-t * 260) + np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 200) * 0.3) * 0.7


def bell(f, d=1.4):
    t = tt(d)
    x = np.zeros(len(t))
    for mult, a, dec in [(1, 1, 3), (2.0, .45, 5), (3.01, .25, 7), (4.2, .12, 9)]:
        x += a * np.sin(2 * np.pi * f * mult * t) * np.exp(-t * dec)
    return x * np.clip(t / 0.003, 0, 1) * 0.5


def glitch(d=0.35):
    t = tt(d)
    x = np.zeros(len(t))
    k = 0
    while k < len(t):
        seg = int(SR * rng.uniform(0.012, 0.04))
        f = rng.choice([180, 330, 660, 1320, 90])
        sq = np.sign(np.sin(2 * np.pi * f * t[:seg]))
        if rng.random() < 0.4:
            sq = np.round(noise(seg / SR) * 3) / 3
        n = min(seg, len(sq), len(x) - k)
        x[k:k + n] = sq[:n] * rng.uniform(0.2, 0.7) * (rng.random() < 0.8)
        k += seg
    return bq(x, 'bandpass', [150, 6000]) * 0.5


# ---------------------------------------------------------------- music
CH = {  # (bass midi, chord voicing)
    'Am': (33, [57, 60, 64, 69]),
    'F': (29, [57, 60, 65, 69]),
    'C': (36, [55, 60, 64, 67]),
    'G': (31, [55, 59, 62, 67]),
}
BARS = [(4, 'Am'), (6, 'F'), (8, 'C'), (10, 'G'), (12, 'Am'), (14, 'F'), (16, 'C'), (18, 'G'),
        (20, 'Am'), (22, 'F'), (24, 'C'), (26, 'G')]


def chord_at(t):
    name = 'Am'
    for b0, nm in BARS:
        if t >= b0:
            name = nm
    return CH[name]


def in_break(t):
    return 16.0 <= t < 16.5 or 26.0 <= t < 27.0


# intro pad + heartbeat (0-4)
t = tt(4.2)
pad = np.zeros(len(t))
for m in [45, 52, 57, 60, 64]:
    pad += saw(mf(m), t, (-9, -3, 4, 10))
pad = onepole_sweep(pad, 250, 2400, 2.5) * np.clip(t / 1.2, 0, 1) * np.clip((4.15 - t) / 0.2, 0, 1)
put(mus, pad * 0.17, 0, r=0.4)
for b in np.arange(0, 3.5, BEAT):
    s = tt(0.3)
    put(drm, np.sin(2 * np.pi * 50 * s) * np.exp(-s * 14) * 0.55, b)
for k, b in enumerate(np.arange(0, 4.0, BEAT / 4)):
    put(drm, hat(), b, g=0.07 + 0.2 * (b / 4), pan=0.25)

# groove
kick_times = []
for b in np.arange(4.0, 27.0, BEAT):
    if in_break(b):
        continue
    if 16.5 <= b < 19.5:
        continue  # slams section handles its own kicks
    kick_times.append(b)
slam = [16.5, 17.125, 17.75, 18.375, 19.0, 19.5]
kick_times += slam
kick_times += [27.0]
kick_times = sorted(set(kick_times))
for kt in kick_times:
    put(drm, kick(big=kt in (4.0, 16.5, 19.5, 27.0)), kt, g=0.95)

for b in np.arange(4.0, 26.0, BEAT):
    beat_idx = int(round((b - 4.0) / BEAT))
    if in_break(b) or 16.5 <= b < 19.5:
        continue
    if beat_idx % 2 == 1:
        put(drm, clap(), b, g=0.42, r=0.25)
    put(drm, hat(open_=True), b + BEAT / 2, g=0.09, pan=0.3)
    for s16 in (0.125, 0.375):
        put(drm, hat(), b + s16, g=0.045, pan=-0.3)
for b in np.arange(16.5, 19.5, 0.125):
    put(drm, hat(), b, g=0.10, pan=0.2)
# snare rolls into drops
for (a, z) in [(15.5, 16.5), (26.0, 27.0)]:
    n = int((z - a) / 0.0625)
    for k in range(n):
        tk = a + k * 0.0625
        put(drm, clap(), tk, g=0.12 + 0.4 * (k / n), r=0.1)

# bass: 8th notes, octave pump
for b in np.arange(4.0, 27.0, BEAT / 2):
    if in_break(b):
        continue
    root, _ = chord_at(b)
    m = root + (12 if int(round(b / 0.25)) % 2 else 0)
    d = BEAT / 2
    s = tt(d)
    x = saw(mf(m + 12), s, (-6, 6)) * 0.6 + np.sin(2 * np.pi * mf(m) * s) * 0.8
    x = bq(x, 'lowpass', 900) * np.exp(-s * 5) * np.clip(s / 0.004, 0, 1) * np.clip((d - s) / 0.01, 0, 1)
    put(mus, x * 0.42, b)

# chord stabs on offbeats + arp 16ths
for b in np.arange(4.0, 27.0, BEAT):
    if in_break(b):
        continue
    _, voic = chord_at(b)
    s = tt(0.32)
    x = np.zeros(len(s))
    for m in voic:
        x += saw(mf(m), s, (-14, -5, 5, 14))
    x = bq(x, 'lowpass', 3200) * np.exp(-s * 11) * np.clip(s / 0.003, 0, 1)
    put(mus, x * 0.11, b + BEAT / 2, pan=0.0, r=0.3)
arp_pat = [0, 1, 2, 3, 2, 1, 3, 2]
for k, b in enumerate(np.arange(4.0, 29.0, BEAT / 4)):
    if in_break(b):
        continue
    _, voic = chord_at(min(b, 26.9)) if b < 27 else CH['C']
    m = voic[arp_pat[k % 8]] + 12
    s = tt(0.16)
    x = (2 * ((s * mf(m)) % 1) - 1) * 0.5 + np.sin(2 * np.pi * mf(m) * s)
    x = bq(x, 'lowpass', 4200) * np.exp(-s * 26)
    fade = 1.0 if b < 27 else max(0, 1 - (b - 27) / 2)
    put(mus, x * 0.07 * fade, b, pan=0.35 * np.sin(k * 0.7), r=0.35)

# sustained pad under groove (quiet) and final chord
for b0, nm in BARS:
    if b0 >= 26:
        continue
    _, voic = CH[nm]
    s = tt(2.05)
    x = np.zeros(len(s))
    for m in voic:
        x += saw(mf(m - 12), s, (-10, 0, 10))
    x = bq(x, 'lowpass', 1400) * np.clip(s / 0.25, 0, 1) * np.clip((2.05 - s) / 0.2, 0, 1)
    put(mus, x * 0.05, b0, r=0.3)
s = tt(3.0)
fin = np.zeros(len(s))
for m in [36, 48, 55, 60, 64, 67, 72, 74, 79]:
    fin += saw(mf(m), s, (-12, -4, 4, 12)) * (1.3 if m < 50 else 1)
fin = onepole_sweep(fin, 5500, 900, 0.7) * np.exp(-s * 0.5) * np.clip(s / 0.01, 0, 1)
put(mus, fin * 0.12, 27.0, r=0.5)

# ---------------------------------------------------------------- sidechain
env = np.ones(N)
tn = np.arange(N) / SR
for kt in kick_times:
    i = int(kt * SR)
    j = min(N, i + int(0.45 * SR))
    env[i:j] = np.minimum(env[i:j], 1 - 0.75 * np.exp(-(tn[i:j] - kt) * 9))
mus *= env

# ---------------------------------------------------------------- SFX (synced to visuals)
put(sfx, whoosh(0.5), -0.05, g=0.35, pan=-0.6)       # left window
put(sfx, whoosh(0.5), 0.5, g=0.35, pan=0.6)          # right window
for tk in [0.1, 1.0, 1.8, 2.66]:                       # kinetic headlines
    put(sfx, pop(520, 0.12), tk, g=0.35)
    put(sfx, whoosh(0.25, bright=1.4), tk - 0.05, g=0.18)
put(sfx, whoosh(0.55, bright=1.2), 1.88, g=0.3, pan=0.2)  # copy flight
put(sfx, tick(), 2.45, g=0.8)
put(sfx, pop(900), 2.47, g=0.3)
put(sfx, glitch(0.45), 2.72, g=0.55)
put(sfx, riser(2.0), 2.0, g=0.55, r=0.2)
put(sfx, whoosh(0.35, up=True, bright=0.6), 3.15, g=0.5)
for tl in [3.5, 3.75, 4.0]:
    put(sfx, thock(), tl, g=0.75 if tl < 4 else 0.9, r=0.35)
put(sfx, impact(1.1), 4.0, g=0.75, r=0.6)
put(sfx, bell(mf(76), 2.0), 4.55, g=0.35, r=0.6)      # wordmark sparkle
put(sfx, bell(mf(83), 2.0), 4.7, g=0.25, r=0.6)
put(sfx, pop(1200), 5.05, g=0.25)
put(sfx, whoosh(0.45, bright=0.9), 5.75, g=0.55)      # fly-through
for tk, g in [(6.0, .7), (6.5, .5), (7.0, .85)]:
    put(sfx, impact(0.7), tk, g=g * 0.55, r=0.3)
put(sfx, whoosh(0.4, bright=1.3), 7.5, g=0.25)
for i in range(4):
    put(sfx, pop(mf(76 + [0, 3, 7, 12][i]) / 1.5, 0.1), 8.05 + i * 0.1, g=0.3)
for tc in [9.0, 13.0, 23.0]:                            # stone wipes
    put(sfx, whoosh(0.55, bright=1.0), tc - 0.3, g=0.6, pan=0.3)
    put(sfx, whoosh(0.4, up=False), tc, g=0.35, pan=-0.3)
TXT_N = 12
for k in range(1, TXT_N + 1):
    put(sfx, tick(), 9.85 + k / TXT_N * 0.7, g=0.55, pan=0.3)
put(sfx, whoosh(0.3, bright=1.5), 10.62, g=0.3)
put(sfx, pop(1000), 10.72, g=0.35)
put(sfx, whoosh(0.55, bright=1.2), 11.2, g=0.35, pan=0.4)
put(sfx, pop(700), 11.72, g=0.45)
put(sfx, tick(), 12.2, g=0.9)
put(sfx, bell(mf(84), 1.5), 12.2, g=0.35, r=0.4)
put(sfx, bell(mf(88), 1.5), 12.32, g=0.3, r=0.4)
for k in range(11):
    put(sfx, pop(mf([69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93][k]) / 2, 0.09), 13.45 + k * 0.075, g=0.22, pan=-0.5 + k * 0.1)
put(sfx, whoosh(0.7, bright=1.0), 14.95, g=0.45)
put(sfx, riser(0.9), 15.6, g=0.5)
for i, tk in enumerate(slam):
    put(sfx, impact(0.9), tk, g=0.6 if i != 4 else 0.45, r=0.35)
put(sfx, whoosh(0.35, up=False), 19.5, g=0.5)
t = tt(0.9)                                             # bar grow whirr
fr = 220 * 2 ** (np.clip(t / 0.9, 0, 1) * 2)
whirr = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / 0.9) * 0.25
put(sfx, whirr, 19.95, g=0.6)
put(sfx, whoosh(0.35, bright=1.2), 21.1, g=0.35)
for i in range(10):
    put(sfx, pop(400 + i * 30, 0.06), 21.55 + i * 0.035, g=0.15)
put(sfx, bell(mf(81), 1.6), 22.05, g=0.4, r=0.4)
put(sfx, whoosh(0.35), 22.2, g=0.3)
for k in range(10):
    put(sfx, tick(), 22.4 + k * 0.04, g=0.35)
put(sfx, pop(800, 0.1), 23.3, g=0.35)
for k in range(3):
    put(sfx, pop(1400, 0.05), 23.7 + k * 0.08, g=0.12)
for k in range(8):
    put(sfx, bell(mf([84, 88, 91, 96][k % 4]), 0.6), 23.95 + k * 0.05, g=0.07, r=0.5)
put(sfx, pop(900), 24.2, g=0.2)
put(sfx, pop(1100), 24.28, g=0.2)
put(sfx, whoosh(0.4, bright=1.1), 24.4, g=0.4)
for i in range(3):
    put(sfx, pop(500 + i * 120, 0.1), 24.7 + i * 0.1, g=0.3)
for i in range(4):
    put(sfx, pop(mf(79 + i * 2), 0.07), 25.0 + i * 0.12, g=0.2)
    put(sfx, tick(), 25.0 + i * 0.12, g=0.3)
put(sfx, whoosh(0.4, bright=0.8), 25.65, g=0.5)
put(sfx, impact(0.8), 25.95, g=0.45, r=0.4)
put(sfx, riser(1.0), 26.0, g=0.65, r=0.2)
put(sfx, impact(1.2), 27.0, g=0.8, r=0.6)
for tl in [27.0, 27.1, 27.2]:
    put(sfx, thock(), tl, g=0.55, r=0.3)
put(sfx, bell(mf(84), 2.5), 27.3, g=0.3, r=0.6)
put(sfx, bell(mf(91), 2.5), 27.9, g=0.22, r=0.6)
for k in range(6):
    put(sfx, bell(mf([96, 100, 103, 108, 103, 100][k]), 0.8), 28.7 + k * 0.07, g=0.06, r=0.6)

# ---------------------------------------------------------------- reverb + master
ir_t = tt(2.2)
ir = np.stack([rng.standard_normal(len(ir_t)), rng.standard_normal(len(ir_t))]) * np.exp(-ir_t * 3.2)
ir[:, : int(0.012 * SR)] = 0
ir = np.stack([bq(ir[0], 'lowpass', 6000), bq(ir[1], 'lowpass', 6000)])
wet = np.stack([sg.fftconvolve(rev[c], ir[c])[:N] for c in range(2)])
wet /= np.max(np.abs(wet)) + 1e-9

mix = mus * 2.3 + drm * 0.9 + sfx * 0.8
mix /= np.max(np.abs(mix))
mix = mix + wet * 0.18
# gentle high-pass on master and glue
mix = np.stack([bq(mix[c], 'highpass', 28) for c in range(2)])
mix = np.tanh(mix * 1.35) / np.tanh(1.35)
fade = np.clip((DUR - tn) / 0.8, 0, 1) ** 1.5
fadein = np.clip(tn / 0.01, 0, 1)
mix *= fade * fadein
mix *= 0.93 / np.max(np.abs(mix))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'audio.wav')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wavfile.write(OUT, SR, (mix.T * 32767).astype(np.int16))
print('ok, peak', np.max(np.abs(mix)), 'rms', np.sqrt(np.mean(mix ** 2)))
