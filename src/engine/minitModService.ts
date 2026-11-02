import * as PIXI from 'pixi.js';
import { CFG, PALETTE, numToHex } from '../data/config';
import { EffectRegistry } from '../data/effects';
import { CORE_MINIT_IDS, MINIT_DB, registerMinit, unregisterMinit } from '../data/minits';
import { registerAudioProfiles } from '../data/sfx';
import { CustomMinitRecord, MinitDef } from '../types/game';
import { AssetBaker } from './assetBaker';
import { AudioSys } from './audio';
import {
  Archetype,
  Blueprint,
  EntityBlueprint,
  Trait,
  resolveEntityTex,
  tagTrait
} from './blueprint';
import { FastMath } from './fastMath';
import { Textures, pngTexture } from './textures';

const STORAGE_KEY = 'md_custom_minits_v1';

/**
 * Token-aware TypeScript-to-JavaScript transpiler designed specifically for
 * single-file Minit `.ts` modules (`src/data/minits/<minit>.ts`).
 *
 * Safely preserves all string literals (including long base64 PNG data URLs)
 * while stripping TypeScript imports, interfaces, type aliases, generic type
 * arguments, type annotations, and `as` casts, and rewriting `export` into
 * `__exports` assignments.
 */
export function transpileMinitTsToJs(tsSource: string): string {
  // Step 1: Extract string/template literals and comments into placeholders
  // so regex transformations never corrupt base64 PNG data URLs or strings.
  const literals: string[] = [];
  let masked = '';
  let i = 0;
  const n = tsSource.length;

  while (i < n) {
    const ch = tsSource[i];
    const next = tsSource[i + 1];

    // Single-line comment
    if (ch === '/' && next === '/') {
      while (i < n && tsSource[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(tsSource[i] === '*' && tsSource[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // String or template literal
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let start = i;
      i++;
      while (i < n) {
        if (tsSource[i] === '\\') {
          i += 2;
          continue;
        }
        if (tsSource[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      const lit = tsSource.slice(start, i);
      const idx = literals.length;
      literals.push(lit);
      masked += `__STR_LIT_${idx}__`;
      continue;
    }

    masked += ch;
    i++;
  }

  // Step 2: Strip `import ... from ...;` statements (single and multi-line)
  masked = masked.replace(/^\s*import\s+[\s\S]*?from\s+__STR_LIT_\d+__\s*;?/gm, '');
  masked = masked.replace(/^\s*import\s+__STR_LIT_\d+__\s*;?/gm, '');

  // Step 3: Strip `interface Name { ... }` blocks (with nested braces)
  masked = stripBalancedKeywordBlock(masked, /\b(?:export\s+)?interface\s+[A-Za-z0-9_$]+/g);

  // Step 4: Strip `type Name = ...;` declarations
  masked = masked.replace(
    /^\s*(?:export\s+)?type\s+[A-Za-z0-9_$]+(?:\s*<[^>]*>)?\s*=[\s\S]*?;/gm,
    ''
  );

  // Step 5: Strip generic type arguments on known TS patterns:
  // e.g. `: MinitDef<Config, State>` or `new Map<string, number>()` or `function foo<T>(`
  masked = masked.replace(
    /\b(MinitDef|MinitContext|Record|Map|Set|Array|Partial|Promise)\s*<[^;={}()]+>/g,
    '$1'
  );

  // Step 6: Strip variable declaration type annotations:
  // e.g. `const fooMinit: MinitDef =` -> `const fooMinit =`
  masked = masked.replace(
    /\b(const|let|var)\s+([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$.|&[\]\s<>]+(?=\s*=)/g,
    '$1 $2'
  );

  // Step 7: Strip function return type annotations before `{` or `=>`:
  // e.g. `function fire(ctx: any): void {` -> `function fire(ctx: any) {`
  masked = masked.replace(
    /\)\s*:\s*[A-Za-z0-9_$.|&[\]\s<>]+(?=\s*(?:\{|=>))/g,
    ')'
  );

  // Step 8: Strip parameter type annotations inside `(...)` parameter lists
  masked = stripParameterTypes(masked);

  // Step 9: Strip `as const` and `as SomeType` assertions
  masked = masked.replace(/\bas\s+const\b/g, '');
  masked = masked.replace(/\bas\s+[A-Za-z0-9_$.[\]<>|&]+/g, '');

  // Step 10: Transform `export default ...` and `export const/let/function ...`
  masked = masked.replace(/\bexport\s+default\s+/g, '__exports.default = ');
  masked = masked.replace(
    /\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/g,
    'const $1 = __exports.$1 ='
  );
  masked = masked.replace(
    /\bexport\s+function\s+([A-Za-z0-9_$]+)/g,
    'function $1'
  );

  // Step 11: Restore string literals
  const restored = masked.replace(/__STR_LIT_(\d+)__/g, (_, idxStr) => {
    return literals[Number(idxStr)] ?? '""';
  });

  return restored;
}

function stripBalancedKeywordBlock(code: string, regex: RegExp): string {
  let result = code;
  let match: RegExpExecArray | null;
  // Reset regex and scan
  while ((match = regex.exec(result)) !== null) {
    const startIdx = match.index;
    let braceStart = result.indexOf('{', startIdx + match[0].length);
    if (braceStart === -1) break;
    let depth = 0;
    let endIdx = braceStart;
    while (endIdx < result.length) {
      if (result[endIdx] === '{') depth++;
      else if (result[endIdx] === '}') {
        depth--;
        if (depth === 0) {
          endIdx++;
          break;
        }
      }
      endIdx++;
    }
    result = result.slice(0, startIdx) + result.slice(endIdx);
    regex.lastIndex = startIdx;
  }
  return result;
}

function stripParameterTypes(code: string): string {
  // Strip `: Type` inside function parameter parentheses `(a: Type, b: Type = 1)`
  return code.replace(/\(([^()]*)\)\s*(?=\{|=>)/g, (full, inner: string) => {
    // Only strip if it looks like parameter list (not an object literal inside parens)
    if (!inner.includes(':')) return full;
    if (inner.trim().startsWith('{')) {
      // Destructured parameter with type: `({ a, b }: MinitContext)`
      const cleaned = inner.replace(/\}\s*:\s*[A-Za-z0-9_$.<>[\]|&\s]+$/, '}');
      return full.replace(inner, cleaned);
    }
    const parts = inner.split(',').map((param) => {
      // Handle `name?: Type = default` or `name: Type`
      return param.replace(
        /^(\s*(?:\.\.\.)?[A-Za-z0-9_$]+)\s*\??\s*:\s*[^=]+(\s*=.*)?$/,
        '$1$2'
      );
    });
    return full.replace(inner, parts.join(','));
  });
}

/**
 * Evaluates a `.ts` Minit source string in an isolated sandbox with the complete
 * Mining Duels SDK injected, validates the exported `MinitDef`, and returns it.
 */
export function evaluateMinitTsModule(
  tsSource: string,
  fileName = 'custom.ts'
): MinitDef<any, any> {
  const jsCode = transpileMinitTsToJs(tsSource);
  const __exports: Record<string, any> = {};

  const sdkGlobals = {
    __exports,
    PIXI,
    CFG,
    PALETTE,
    numToHex,
    FastMath,
    Blueprint,
    EntityBlueprint,
    Trait,
    Archetype,
    Textures,
    pngTexture,
    AudioSys,
    EffectRegistry,
    registerAudioProfiles,
    resolveEntityTex,
    tagTrait,
    Math,
    console
  };

  const argNames = Object.keys(sdkGlobals);
  const argValues = Object.values(sdkGlobals);

  let returnedVal: any;
  try {
    const fn = new Function(
      ...argNames,
      `"use strict";\n${jsCode}\nreturn __exports;`
    );
    returnedVal = fn(...argValues);
  } catch (err: any) {
    throw new Error(
      `Compile error in "${fileName}": ${err?.message || String(err)}`
    );
  }

  // Locate the exported MinitDef object
  let candidate: any = returnedVal?.default;
  if (!candidate || typeof candidate !== 'object') {
    for (const val of Object.values(returnedVal || {})) {
      if (val && typeof val === 'object' && typeof (val as any).id === 'string') {
        candidate = val;
        break;
      }
    }
  }

  if (!candidate || typeof candidate !== 'object') {
    throw new Error(
      `No exported MinitDef found in "${fileName}". Export a MinitDef via "export const myMinit: MinitDef = { ... }".`
    );
  }

  validateMinitDef(candidate, fileName);
  candidate.isCustom = true;
  return candidate as MinitDef<any, any>;
}

export function validateMinitDef(def: any, sourceLabel = 'Minit'): void {
  if (!def || typeof def !== 'object') {
    throw new Error(`${sourceLabel}: Definition must be an object.`);
  }
  if (typeof def.id !== 'string' || !/^[a-z0-9_-]{2,24}$/i.test(def.id.trim())) {
    throw new Error(
      `${sourceLabel}: "id" must be a 2-24 character alphanumeric identifier (got "${String(def.id)}").`
    );
  }
  def.id = def.id.trim().toLowerCase();
  if (CORE_MINIT_IDS.has(def.id)) {
    throw new Error(
      `${sourceLabel}: id "${def.id}" is reserved by a built-in core Minit. Choose a unique id.`
    );
  }
  if (typeof def.name !== 'string' || def.name.trim().length === 0) {
    throw new Error(`${sourceLabel}: "name" must be a non-empty string.`);
  }
  if (typeof def.color !== 'number' || Number.isNaN(def.color)) {
    throw new Error(`${sourceLabel}: "color" must be a hex number (e.g. 0x00ffcc).`);
  }
  if (typeof def.cd !== 'number' || def.cd < 1) {
    throw new Error(`${sourceLabel}: "cd" (cooldown ticks) must be a number >= 1.`);
  }
  if (typeof def.roam !== 'number' || def.roam < 0) {
    def.roam = 2;
  }
  if (typeof def.desc !== 'string' || !def.desc.trim()) {
    def.desc = 'Custom external autonomous mining unit.';
  }
  if (!def.textures || !def.textures.base) {
    throw new Error(
      `${sourceLabel}: "textures.base" is required (either a (g, c) => void drawer or a base64 PNG data URL).`
    );
  }
}

export const MinitModService = {
  getRecords(): CustomMinitRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveRecords(records: CustomMinitRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[MinitModService] Failed to save custom minits to localStorage:', err);
    }
  },

  /**
   * Loads all persisted custom `.ts` Minits from localStorage on boot,
   * compiles them, registers their audio/effects, and bakes their textures/VFX.
   */
  async loadCustomMinitsOnBoot(renderer: PIXI.IRenderer): Promise<CustomMinitRecord[]> {
    const records = this.getRecords();
    const validRecords: CustomMinitRecord[] = [];
    for (const rec of records) {
      try {
        const def = evaluateMinitTsModule(rec.sourceCode, rec.fileName);
        registerMinit(def);
        await AssetBaker.bakeSingleMinit(renderer, def);
        validRecords.push(rec);
      } catch (err) {
        console.warn(`[MinitModService] Skipping invalid saved Minit "${rec.id}":`, err);
      }
    }
    return validRecords;
  },

  /**
   * Compiles, validates, bakes, and persists a new or updated `.ts` Minit.
   */
  async importMinitFromTs(
    fileName: string,
    sourceCode: string,
    renderer: PIXI.IRenderer | null
  ): Promise<{ def: MinitDef<any, any>; record: CustomMinitRecord }> {
    const normalizedFileName = fileName.endsWith('.ts')
      ? fileName
      : `${fileName.replace(/\.[a-z0-9]+$/i, '')}.ts`;

    const def = evaluateMinitTsModule(sourceCode, normalizedFileName);
    registerMinit(def);

    if (renderer) {
      await AssetBaker.bakeSingleMinit(renderer, def);
    }

    const record: CustomMinitRecord = {
      id: def.id,
      name: def.name,
      fileName: `${def.id}.ts`,
      sourceCode,
      createdAt: Date.now()
    };

    const existing = this.getRecords().filter((r) => r.id !== def.id);
    existing.push(record);
    this.saveRecords(existing);

    return { def, record };
  },

  /**
   * Deletes a custom Minit from both the runtime registry and localStorage.
   */
  deleteCustomMinit(id: string): boolean {
    if (CORE_MINIT_IDS.has(id)) return false;
    unregisterMinit(id);
    const next = this.getRecords().filter((r) => r.id !== id);
    this.saveRecords(next);
    return true;
  },

  /**
   * Exports a Minit as a downloadable `<minit>.ts` file.
   */
  exportMinitTsFile(id: string): void {
    const records = this.getRecords();
    const customRec = records.find((r) => r.id === id);
    const source = customRec ? customRec.sourceCode : generateStarterTemplateTs(id);
    const blob = new Blob([source], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  downloadTemplateTsFile(): void {
    const source = generateStarterTemplateTs('vortex');
    const blob = new Blob([source], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vortex.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

/**
 * Generates a self-contained, ready-to-import `<minit>.ts` TypeScript file
 * following the exact `src/data/minits/<minit>.ts` architecture.
 */
export function generateStarterTemplateTs(minitId = 'vortex'): string {
  const safeId = minitId.replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'vortex';
  const upperName = safeId.toUpperCase();

  return `import { MinitDef } from '../../types/game';
import { Blueprint, Trait, Archetype } from '../../engine/blueprint';
import { FastMath } from '../../engine/fastMath';

export interface CustomMinitConfig {
  orbCount: number;
  orbDmg: number;
  blastRadius: number;
  beamDmg: number;
  beamLength: number;
}

export interface CustomMinitState {
  cycles: number;
}

export const ${safeId}Minit: MinitDef<CustomMinitConfig, CustomMinitState> = {
  id: '${safeId}',
  name: '${upperName}',
  role: 'Singularity Excavator',
  color: 0x00ffcc,
  roam: 3,
  cd: 26,
  desc: 'Launches twin gravitic plasma orbs that detonate on impact and fires an overdrive drill every 3rd cycle.',

  config: {
    orbCount: 2,
    orbDmg: 22,
    blastRadius: 1,
    beamDmg: 30,
    beamLength: 5
  },

  // Supports procedural (g, c) => void OR a PNG base64 Data URL via pngTexture('data:image/png;base64,...')
  textures: {
    base: (g, c) => {
      g.beginFill(0x0b1320).drawRect(-7, -7, 14, 14).endFill();
      g.lineStyle(1.5, c, 1).drawRect(-6, -6, 12, 12);
      g.lineStyle(0).beginFill(c, 0.95).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffffff, 1).drawRect(-1.5, -1.5, 3, 3).endFill();
    }
  },

  vfx: {
    orb: (g, c) => {
      g.beginFill(c, 0.9).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 2).endFill();
    },
    spark: (g, c) => {
      g.beginFill(c, 1).drawRect(-1.5, -1.5, 3, 3).endFill();
    }
  },

  audio: {
    ${safeId}_pulse: {
      t: 'triangle',
      f0: 520,
      f1: 140,
      d: 0.16,
      v: 0.22
    }
  },

  onInit: ({ state }) => {
    state.cycles = 0;
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    state.cycles++;
    const log = slot.log;
    const p = arena.getPixelCoords(log.x, log.y);

    playSound('${safeId}_pulse', 0.9);

    // Spawn gravitic mortar orbs toward nearby blocks below
    for (let i = 0; i < config.orbCount; i++) {
      const tx = arena.clampX(log.x + FastMath.randInt(-3, 3));
      const ty = arena.clampY(log.y + FastMath.randInt(1, 3));

      spawn(
        Archetype.mortarBomb({
          tx,
          ty,
          dmg: config.orbDmg,
          radius: config.blastRadius,
          duration: 18,
          arcHeight: 1.3,
          color: slot.md.color,
          trailTex: tex('orb'),
          sound: 'explosion'
        })
      );
    }

    // Every 3rd cycle, unleash a concentrated vertical beam
    if (state.cycles % 3 === 0) {
      arena.shake = Math.max(arena.shake, 3);
      arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 44, 3);
      spawn(
        Archetype.beamVertical({
          dmg: config.beamDmg,
          length: config.beamLength,
          color: slot.md.color,
          duration: 14,
          renderLaser: true
        })
      );
    }
  }
};
`;
}
