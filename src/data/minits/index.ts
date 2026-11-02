import { MinitDef } from '../../types/game';
import { EffectRegistry } from '../effects';
import { registerAudioProfiles } from '../sfx';
import { absorbMinit } from './absorb';
import { alchemistMinit } from './alchemist';
import { frenzyMinit } from './frenzy';
import { laserMinit } from './laser';
import { lithosMinit } from './lithos';
import { mothMinit } from './moth';
import { sentinelMinit } from './sentinel';
import { symbioteMinit } from './symbiote';
import { turretMinit } from './turret';

export const MINIT_LIST: MinitDef<any, any>[] = [
  laserMinit,
  mothMinit,
  absorbMinit,
  lithosMinit,
  symbioteMinit,
  sentinelMinit,
  frenzyMinit,
  alchemistMinit,
  turretMinit
];

export const CORE_MINIT_IDS = new Set<string>(MINIT_LIST.map((m) => m.id));

export const MINIT_DB: Record<string, MinitDef<any, any>> = {};

export function registerMinit(def: MinitDef<any, any>): void {
  MINIT_DB[def.id] = def;
  const existingIdx = MINIT_LIST.findIndex((m) => m.id === def.id);
  if (existingIdx >= 0) {
    MINIT_LIST[existingIdx] = def;
  } else {
    MINIT_LIST.push(def);
  }
  if (def.audio) {
    registerAudioProfiles(def.audio);
  }
  if (def.effects) {
    EffectRegistry.register(def.effects);
  }
}

export function unregisterMinit(id: string): boolean {
  if (CORE_MINIT_IDS.has(id)) return false;
  delete MINIT_DB[id];
  const idx = MINIT_LIST.findIndex((m) => m.id === id);
  if (idx >= 0) {
    MINIT_LIST.splice(idx, 1);
  }
  return true;
}

// Auto-register each core Minit's co-located AudioProfiles and Status Effects
for (const m of [...MINIT_LIST]) {
  registerMinit(m);
}
