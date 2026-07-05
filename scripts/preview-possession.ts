/**
 * Deterministic geometry preview for the possession-theater choreography.
 *
 * Builds a handful of hand-made SimEvents (no simulator), runs buildPossessionPlan,
 * samples every mover at several times, and renders each possession as a FILMSTRIP
 * PNG: a court diagram + labeled sprites (shooter ringed) + the ball path + the
 * camera frame box + a header. Lets you SEE the geometry (are shooters at the arc /
 * paint? are spacers spaced? do defenders contest? is the ball carried up?) without
 * the RN simulator.
 *
 *   npx tsx scripts/preview-possession.ts
 *   qlmanage -t -s 1200 -o /tmp preview-out/*.png && open /tmp/*.png.png
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Jimp, ResizeStrategy } from 'jimp';
import { Canvas, type RGBA } from '../src/art/pixelCanvas';
import { drawText } from '../src/art/pixelFont';
import { buildPossessionPlan, type Frac, type PossessionPlan, type Waypoint } from '../src/components/game/choreography';
import { COURT, CENTER_LINE_Y, CENTER_CIRCLE, LANE, FT_CIRCLE, RIM, BACKBOARD, THREE } from '../src/components/game/courtDimensions';
import { POSITIONS } from '../src/types/roster';
import type { OnCourtFive, SimActionId, SimEvent, SimTeamSide } from '../src/types/sim';

const SCALE = 6; // px per court foot
const W = COURT.width * SCALE; // 300
const H = COURT.length * SCALE; // 564
const HEADER = 22;
const GAP = 8;

const NAVY: RGBA = [26, 26, 46, 255];
const LINE: RGBA = [90, 100, 130, 255];
const HOME: RGBA = [232, 120, 60, 255]; // warm (home attacks the TOP rim)
const AWAY: RGBA = [80, 150, 220, 255]; // cool
const BALL: RGBA = [250, 220, 60, 255];
const CAMBOX: RGBA = [120, 200, 140, 255];
const INK: RGBA = [235, 235, 240, 255];
const DIM: RGBA = [150, 155, 175, 255];

const ft = (v: number) => v * SCALE;
const fracX = (x: number) => x * W;
const fracY = (y: number) => y * H;

/** Piecewise-linear sample of a waypoint path at time atMs. */
function sampleAt(wps: Waypoint[] | undefined, atMs: number): Frac | undefined {
  if (!wps || wps.length === 0) return undefined;
  if (atMs <= wps[0].atMs) return wps[0].frac;
  const last = wps[wps.length - 1];
  if (atMs >= last.atMs) return last.frac;
  for (let i = 1; i < wps.length; i++) {
    if (atMs <= wps[i].atMs) {
      const a = wps[i - 1];
      const b = wps[i];
      const t = (atMs - a.atMs) / (b.atMs - a.atMs || 1);
      return { x: a.frac.x + (b.frac.x - a.frac.x) * t, y: a.frac.y + (b.frac.y - a.frac.y) * t };
    }
  }
  return last.frac;
}

/** Draw the full 94x50 court (both ends mirrored about center) into a panel. */
function drawCourt(c: Canvas): void {
  c.fillRect(0, 0, W, H, NAVY);
  // Sidelines / baselines.
  const border = 1;
  c.fillRect(0, 0, W, border, LINE);
  c.fillRect(0, H - border, W, border, LINE);
  c.fillRect(0, 0, border, H, LINE);
  c.fillRect(W - border, 0, border, H, LINE);
  // Center line + circle.
  c.fillRect(0, ft(CENTER_LINE_Y), W, 1, LINE);
  c.ellipseRing(ft(CENTER_CIRCLE.cx), ft(CENTER_CIRCLE.cy), ft(CENTER_CIRCLE.r), ft(CENTER_CIRCLE.r), 1, LINE);
  // Both ends: lane, FT circle, rim, backboard, 3pt line.
  for (const top of [true, false]) {
    const flip = (yFt: number) => (top ? yFt : COURT.length - yFt);
    // Lane box.
    const laneY0 = top ? 0 : COURT.length - LANE.depth;
    // lane rectangle outline
    c.fillRect(ft(LANE.x), ft(laneY0), 1, ft(LANE.depth), LINE);
    c.fillRect(ft(LANE.x + LANE.w), ft(laneY0), 1, ft(LANE.depth), LINE);
    c.fillRect(ft(LANE.x), ft(top ? LANE.depth : COURT.length - LANE.depth), ft(LANE.w), 1, LINE);
    // FT circle.
    c.ellipseRing(ft(FT_CIRCLE.cx), ft(flip(FT_CIRCLE.cy)), ft(FT_CIRCLE.r), ft(FT_CIRCLE.r), 1, LINE);
    // Rim + backboard.
    c.ellipseRing(ft(RIM.cx), ft(flip(RIM.cy)), ft(RIM.r) + 1, ft(RIM.r) + 1, 1, [220, 120, 70, 255]);
    c.fillRect(ft(BACKBOARD.x1), ft(flip(BACKBOARD.y)), ft(BACKBOARD.x2 - BACKBOARD.x1), 1, LINE);
    // Three-point line: two corner segments + an arc of radius THREE.radius about the rim.
    const rimY = flip(RIM.cy);
    const cornerJ = top ? THREE.cornerTopY : COURT.length - THREE.cornerTopY;
    c.fillRect(ft(THREE.cornerX), ft(Math.min(top ? 0 : cornerJ, top ? cornerJ : COURT.length)), 1, ft(Math.abs(cornerJ - (top ? 0 : COURT.length))), LINE);
    c.fillRect(ft(THREE.cornerXFar), ft(Math.min(top ? 0 : cornerJ, top ? cornerJ : COURT.length)), 1, ft(Math.abs(cornerJ - (top ? 0 : COURT.length))), LINE);
    for (let a = -70; a <= 70; a += 3) {
      const rad = (a * Math.PI) / 180;
      const x = RIM.cx + THREE.radius * Math.sin(rad);
      const y = rimY + (top ? 1 : -1) * THREE.radius * Math.cos(rad);
      if (y > 0 && y < COURT.length) c.plot(ft(x), ft(y), LINE);
    }
  }
}

/** Render one time slice of a plan into a fresh panel canvas. */
function renderSlice(plan: PossessionPlan, atMs: number, label: string): Canvas {
  const c = new Canvas(W, H + HEADER, NAVY);
  const court = new Canvas(W, H, NAVY);
  drawCourt(court);
  // Ball path (faint) across the whole possession.
  const legs = plan.ball.legs;
  for (const leg of legs) {
    court.line(fracX(leg.from.x), fracY(leg.from.y), fracX(leg.to.x), fracY(leg.to.y), [90, 80, 40, 255]);
  }
  // Shot leg to the rim the shooter's team attacks (home top, away bottom).
  const rimYFrac = plan.shooterKey.startsWith('home') ? RIM.cy / COURT.length : 1 - RIM.cy / COURT.length;
  court.line(fracX(plan.ball.origin.x), fracY(plan.ball.origin.y), fracX(RIM.cx / COURT.width), fracY(rimYFrac), [110, 95, 45, 255]);
  // Sprites at this time.
  for (const side of ['home', 'away'] as SimTeamSide[]) {
    for (const pos of POSITIONS) {
      const wps = plan.movers[`${side}-${pos}`];
      const f = sampleAt(wps, atMs);
      if (!f) continue;
      const col = side === 'home' ? HOME : AWAY;
      const isShooter = plan.shooterKey === `${side}-${pos}`;
      if (isShooter) court.ellipseRing(fracX(f.x), fracY(f.y), 6, 6, 1, INK);
      court.disc(fracX(f.x), fracY(f.y), 3.4, col);
      drawText(court, pos, fracX(f.x) - 6, fracY(f.y) - 12, side === 'home' ? INK : DIM);
    }
  }
  // Ball position at this time (walk the legs, else at origin/rim).
  const ballF = ballAt(plan, atMs);
  if (ballF) court.disc(fracX(ballF.x), fracY(ballF.y), 2.2, BALL);
  // Camera frame box at this time.
  const cam = camAt(plan, atMs);
  if (cam) {
    const half = 0.5 / cam.zoom;
    const x0 = fracX(cam.center.x - half);
    const y0 = fracY(cam.center.y - half);
    const bw = fracX(2 * half);
    const bh = fracY(2 * half);
    court.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(bw, W), 1, CAMBOX);
    court.fillRect(Math.max(0, x0), Math.min(H - 1, y0 + bh), Math.min(bw, W), 1, CAMBOX);
    court.fillRect(Math.max(0, x0), Math.max(0, y0), 1, Math.min(bh, H), CAMBOX);
    court.fillRect(Math.min(W - 1, x0 + bw), Math.max(0, y0), 1, Math.min(bh, H), CAMBOX);
  }
  // Compose header + court.
  drawText(c, label, 2, 2, INK);
  c.data.set(court.data.subarray(0, W * H * 4), W * HEADER * 4);
  return c;
}

function ballAt(plan: PossessionPlan, atMs: number): Frac | undefined {
  for (const leg of plan.ball.legs) {
    if (atMs >= leg.startMs && atMs <= leg.startMs + leg.ms) {
      const t = (atMs - leg.startMs) / (leg.ms || 1);
      return { x: leg.from.x + (leg.to.x - leg.from.x) * t, y: leg.from.y + (leg.to.y - leg.from.y) * t };
    }
  }
  if (atMs >= plan.preShotMs) return plan.ball.origin;
  return plan.ball.legs[0]?.from ?? plan.ball.origin;
}

function camAt(plan: PossessionPlan, atMs: number): { center: Frac; zoom: number } | undefined {
  const keys = plan.camera.keys;
  if (keys.length === 0) return undefined;
  if (atMs <= keys[0].atMs) return keys[0];
  const last = keys[keys.length - 1];
  if (atMs >= last.atMs) return last;
  for (let i = 1; i < keys.length; i++) {
    if (atMs <= keys[i].atMs) {
      const a = keys[i - 1];
      const b = keys[i];
      const t = (atMs - a.atMs) / (b.atMs - a.atMs || 1);
      return {
        center: { x: a.center.x + (b.center.x - a.center.x) * t, y: a.center.y + (b.center.y - a.center.y) * t },
        zoom: a.zoom + (b.zoom - a.zoom) * t,
      };
    }
  }
  return last;
}

function five(prefix: string): OnCourtFive {
  return POSITIONS.reduce((acc, pos) => {
    acc[pos] = `${prefix}-${pos}`;
    return acc;
  }, {} as OnCourtFive);
}

function ev(over: Partial<SimEvent>): SimEvent {
  return {
    seq: 4,
    clock: 'Q1 10:00',
    quarter: 1,
    team: 'home',
    scorerName: 'x',
    scorerPosition: 'PG',
    action: 'three' as SimActionId,
    result: 'score',
    points: 2,
    homeScore: 2,
    awayScore: 0,
    successRate: 55,
    isBigPlay: false,
    text: 'x',
    onCourt: { home: five('home'), away: five('away') },
    ...over,
  };
}

function toJimp(c: Canvas) {
  const img = new Jimp({ width: c.w, height: c.h, color: 0x00000000 });
  img.bitmap.data.set(c.data);
  return img;
}

async function filmstrip(name: string, event: SimEvent, prev?: SimEvent): Promise<void> {
  const plan = buildPossessionPlan(event, 'full', false, prev);
  const times = [0, plan.preShotMs * 0.5, plan.preShotMs, Math.min(plan.totalMs, plan.preShotMs + 260), plan.totalMs];
  const tags = ['t=0 bringup', 'set', 'shot release', 'ball at rim', 'reset'];
  const panels = times.map((t, i) => renderSlice(plan, t, `${tags[i]}  ${Math.round(t)}ms`));
  const stripW = panels.length * W + (panels.length - 1) * GAP;
  const strip = new Canvas(stripW, H + HEADER, [10, 10, 20, 255]);
  panels.forEach((p, i) => {
    const x0 = i * (W + GAP);
    for (let y = 0; y < p.h; y++) {
      strip.data.set(p.data.subarray(y * p.w * 4, (y + 1) * p.w * 4), ((y * strip.w) + x0) * 4);
    }
  });
  const img = toJimp(strip);
  const factor = 2;
  img.resize({ w: strip.w * factor, h: strip.h * factor, mode: ResizeStrategy.NEAREST_NEIGHBOR });
  const outPath = join(outDir, `${name}.png`);
  await img.write(outPath as `${string}.png`);
  const shot = plan.ball.origin;
  console.log(`ok  ${name}.png  shooter=${plan.shooterKey}  shotSpot=(x${shot.x.toFixed(2)},y${shot.y.toFixed(2)})  preShot=${Math.round(plan.preShotMs)}ms  legs=${plan.ball.legs.length}`);
}

const outDir = join(process.cwd(), 'preview-out');

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const steal = ev({ team: 'away', result: 'steal', action: 'drive' });
  await filmstrip('01-corner-three', ev({ scorerPosition: 'SF', action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 }));
  await filmstrip('02-top-three-iso', ev({ scorerPosition: 'PG', action: 'three', seq: 4 }));
  await filmstrip('03-pnr-dunk', ev({ scorerPosition: 'C', action: 'dunk', assist: { name: 'x', position: 'PG' }, seq: 5 }));
  await filmstrip('04-postup', ev({ scorerPosition: 'PF', action: 'post', assist: { name: 'x', position: 'SG' }, seq: 5 }));
  await filmstrip('05-transition-layup', ev({ scorerPosition: 'SG', action: 'layup', seq: 3 }), steal);
  await filmstrip('06-miss-rebound', ev({ scorerPosition: 'SG', action: 'midrange', result: 'miss', points: 0, seq: 5 }));
  console.log(`\ninspect:  qlmanage -t -s 1400 -o /tmp ${outDir}/*.png && open /tmp/*.png.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
