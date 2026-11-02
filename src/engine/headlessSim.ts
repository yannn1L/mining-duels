import { CFG, numToHex } from '../data/config';
import { MINIT_DB, MINIT_LIST } from '../data/minits';
import {
  BalanceCell,
  BalanceMatchResult,
  BalanceMinitStats,
  BalanceReport,
  BalanceTier
} from '../types/game';
import { Arena } from './arena';
import { AudioSys } from './audio';

/**
 * Executes a single deterministic 1v1 duel between `p1Id` and `p2Id` in pure
 * headless mode (zero WebGL rendering, zero audio overhead).
 * Simulates the full 20-second regulation period (`CFG.SIM.DUR * 60` ticks)
 * plus the sudden-death Overtime strike race (`CFG.SIM.OVERTIME_HITS`).
 */
export function runSingleHeadlessMatch(p1Id: string, p2Id: string): BalanceMatchResult {
  const prevMute = AudioSys.mutedForHeadless;
  AudioSys.mutedForHeadless = true;

  try {
    const a1 = new Arena(p1Id, 2, true);
    const a2 = new Arena(p2Id, 2, true);
    a1.opponentArena = a2;
    a2.opponentArena = a1;

    const regulationTicks = Math.round(CFG.SIM.DUR * 60); // 1200 ticks
    for (let t = 0; t < regulationTicks; t++) {
      a1.tickLogic();
      a2.tickLogic();
    }

    // Overtime: race to mine CFG.SIM.OVERTIME_HITS combined blocks (capped at 1200 extra ticks)
    const overtimeTarget = a1.stats.d + a2.stats.d + CFG.SIM.OVERTIME_HITS;
    let extraTicks = 0;
    const maxOvertimeTicks = 1200;
    while (a1.stats.d + a2.stats.d < overtimeTarget && extraTicks < maxOvertimeTicks) {
      a1.tickLogic();
      a2.tickLogic();
      extraTicks++;
    }

    const p1Score = Math.floor(a1.stats.d * CFG.SIM.MULT) + a1.stats.maxDp;
    const p2Score = Math.floor(a2.stats.d * CFG.SIM.MULT) + a2.stats.maxDp;

    let winner: 'P1' | 'P2' | 'TIE' = 'TIE';
    if (p1Score > p2Score) winner = 'P1';
    else if (p2Score > p1Score) winner = 'P2';

    const result: BalanceMatchResult = {
      p1Id,
      p2Id,
      p1Score,
      p2Score,
      p1Depth: a1.stats.maxDp,
      p2Depth: a2.stats.maxDp,
      p1Mined: a1.stats.d,
      p2Mined: a2.stats.d,
      ticks: regulationTicks + extraTicks,
      winner
    };

    a1.destroy();
    a2.destroy();
    return result;
  } finally {
    AudioSys.mutedForHeadless = prevMute;
  }
}

function classifyBalanceTier(winRate: number): BalanceTier {
  if (winRate >= 65) return 'OP';
  if (winRate >= 54) return 'STRONG';
  if (winRate >= 42) return 'BALANCED';
  return 'WEAK';
}

export interface BalanceRunOptions {
  mode: 'ROUND_ROBIN' | 'ONE_VS_ONE';
  matchesPerPair: number;
  p1Id?: string;
  p2Id?: string;
}

/**
 * Runs a full Round-Robin Matrix or Custom 1v1 headless tournament and returns
 * a comprehensive BalanceReport with per-Minit leaderboard stats and a head-to-head matrix.
 */
export function runHeadlessBalanceCheck(opts: BalanceRunOptions): BalanceReport {
  const t0 = performance.now();
  const matchesPerPair = Math.max(1, Math.min(50, opts.matchesPerPair || 5));

  const participants =
    opts.mode === 'ONE_VS_ONE' && opts.p1Id && opts.p2Id
      ? Array.from(new Set([opts.p1Id, opts.p2Id]))
          .map((id) => MINIT_DB[id])
          .filter(Boolean)
      : [...MINIT_LIST];

  const statsAccum: Record<
    string,
    {
      id: string;
      name: string;
      colorHex: string;
      isCustom: boolean;
      matches: number;
      wins: number;
      losses: number;
      ties: number;
      totalScore: number;
      totalDepth: number;
      totalMined: number;
      maxScore: number;
      minScore: number;
    }
  > = {};

  const matrix: Record<string, Record<string, BalanceCell>> = {};

  for (const m of participants) {
    statsAccum[m.id] = {
      id: m.id,
      name: m.name,
      colorHex: numToHex(m.color),
      isCustom: Boolean(m.isCustom),
      matches: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      totalScore: 0,
      totalDepth: 0,
      totalMined: 0,
      maxScore: 0,
      minScore: Number.POSITIVE_INFINITY
    };
    matrix[m.id] = {};
    for (const opp of participants) {
      matrix[m.id][opp.id] = {
        wins: 0,
        losses: 0,
        ties: 0,
        totalMatches: 0,
        winRate: 0,
        avgScoreDiff: 0
      };
    }
  }

  let totalMatches = 0;

  if (opts.mode === 'ONE_VS_ONE' && opts.p1Id && opts.p2Id) {
    const id1 = opts.p1Id;
    const id2 = opts.p2Id;
    for (let k = 0; k < matchesPerPair; k++) {
      const res = runSingleHeadlessMatch(id1, id2);
      totalMatches++;
      recordMatchResult(res, statsAccum, matrix);
    }
  } else {
    // Full Round-Robin: every distinct pair (i < j) plays `matchesPerPair` games
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const id1 = participants[i].id;
        const id2 = participants[j].id;
        for (let k = 0; k < matchesPerPair; k++) {
          const res = runSingleHeadlessMatch(id1, id2);
          totalMatches++;
          recordMatchResult(res, statsAccum, matrix);
        }
      }
    }
  }

  // Finalize matrix percentages
  for (const rId of Object.keys(matrix)) {
    for (const cId of Object.keys(matrix[rId])) {
      const cell = matrix[rId][cId];
      if (cell.totalMatches > 0) {
        cell.winRate = Math.round(((cell.wins + cell.ties * 0.5) / cell.totalMatches) * 100);
        cell.avgScoreDiff = Math.round(cell.avgScoreDiff / cell.totalMatches);
      }
    }
  }

  const leaderboard: BalanceMinitStats[] = Object.values(statsAccum)
    .map((s) => {
      const m = Math.max(1, s.matches);
      const winRate = Math.round(((s.wins + s.ties * 0.5) / m) * 1000) / 10;
      const avgScore = Math.round(s.totalScore / m);
      const avgDepth = Math.round((s.totalDepth / m) * 10) / 10;
      const avgMined = Math.round((s.totalMined / m) * 10) / 10;
      return {
        id: s.id,
        name: s.name,
        colorHex: s.colorHex,
        isCustom: s.isCustom,
        matches: s.matches,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        winRate,
        avgScore,
        avgDepth,
        avgMined,
        maxScore: s.maxScore,
        minScore: s.minScore === Number.POSITIVE_INFINITY ? 0 : s.minScore,
        tier: classifyBalanceTier(winRate)
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.avgScore - a.avgScore);

  const elapsedMs = Math.max(1, Math.round(performance.now() - t0));

  return {
    mode: opts.mode,
    matchesPerPair,
    totalMatches,
    elapsedMs,
    leaderboard,
    matrix
  };
}

function recordMatchResult(
  res: BalanceMatchResult,
  statsAccum: Record<string, any>,
  matrix: Record<string, Record<string, BalanceCell>>
): void {
  const s1 = statsAccum[res.p1Id];
  const s2 = statsAccum[res.p2Id];
  if (s1) {
    s1.matches++;
    s1.totalScore += res.p1Score;
    s1.totalDepth += res.p1Depth;
    s1.totalMined += res.p1Mined;
    if (res.p1Score > s1.maxScore) s1.maxScore = res.p1Score;
    if (res.p1Score < s1.minScore) s1.minScore = res.p1Score;
    if (res.winner === 'P1') s1.wins++;
    else if (res.winner === 'P2') s1.losses++;
    else s1.ties++;
  }
  if (s2 && res.p2Id !== res.p1Id) {
    s2.matches++;
    s2.totalScore += res.p2Score;
    s2.totalDepth += res.p2Depth;
    s2.totalMined += res.p2Mined;
    if (res.p2Score > s2.maxScore) s2.maxScore = res.p2Score;
    if (res.p2Score < s2.minScore) s2.minScore = res.p2Score;
    if (res.winner === 'P2') s2.wins++;
    else if (res.winner === 'P1') s2.losses++;
    else s2.ties++;
  }

  const c12 = matrix[res.p1Id]?.[res.p2Id];
  if (c12) {
    c12.totalMatches++;
    c12.avgScoreDiff += res.p1Score - res.p2Score;
    if (res.winner === 'P1') c12.wins++;
    else if (res.winner === 'P2') c12.losses++;
    else c12.ties++;
  }

  if (res.p1Id !== res.p2Id) {
    const c21 = matrix[res.p2Id]?.[res.p1Id];
    if (c21) {
      c21.totalMatches++;
      c21.avgScoreDiff += res.p2Score - res.p1Score;
      if (res.winner === 'P2') c21.wins++;
      else if (res.winner === 'P1') c21.losses++;
      else c21.ties++;
    }
  }
}
