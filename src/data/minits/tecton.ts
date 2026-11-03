import { MinitContext, MinitDef } from '../../types/game';
import { Archetype } from '../../engine/blueprint';
import { FastMath } from '../../engine/fastMath';
import { pngTexture } from '../../engine/textures';

const TECTON_BASE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAmUlEQVR4nGNgQAMSEtL/8WF09Ria3UMz/3+dx40V/33gDpbHahBMc0pJN1ghNgwyBCSP1RBk27cEc/5/7+KCgkFieF2BbMAdNTWwJhgA8UGYJANghoAwyQZQ7AWYQvQAJMoAEA1zBTKGiWM1AKYZ2QBsGCRHlAEw/6JrBsnTxwCYIehhgK4OqwHIhqBjdDUYsUAoxxGdK0kBANZjg0z3290TAAAAAElFTkSuQmCC';

const TECTON_SPARK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAMklEQVR4nGNggIKfxWL/QZgBGwBJ/H3gDsYYipAlQQCrQmRF711csFsFEgRJYnUDbQEAa+04itzCRwIAAAAASUVORK5CYII=';

export interface TectonConfig {
  pulseDmg: number;
  pulseDepth: number;
  fissureInterval: number;
  fissureDmg: number;
  fissureRadius: number;
  shake: number;
}

export interface TectonState {
  cycles: number;
}

export const tectonMinit: MinitDef<TectonConfig, TectonState> = {
  id: 'tecton',
  name: 'TECTON',
  role: 'Seismic Excavator',
  color: 0xff9900,
  roam: 2,
  cd: 22,
  desc: 'Heavy seismic excavator using high-res PNG pixel art. Pulses focused seismic tremors downward and triggers a massive rock-cleaving fissure every 4th cycle.',

  config: {
    pulseDmg: 34,
    pulseDepth: 4,
    fissureInterval: 4,
    fissureDmg: 72,
    fissureRadius: 2,
    shake: 4
  },

  audio: {
    tecton_pulse: {
      t: 'triangle',
      f0: 240,
      f1: 65,
      d: 0.18,
      v: 0.22,
      ramp: 'exp'
    },
    tecton_fissure: {
      t: 'sawtooth',
      f0: 160,
      f1: 40,
      d: 0.35,
      v: 0.3,
      ramp: 'exp',
      noise: true
    }
  },

  textures: {
    base: pngTexture(TECTON_BASE_PNG, {
      width: 16,
      height: 16,
      scale: 1,
      padding: 2
    })
  },

  vfx: {
    spark: pngTexture(TECTON_SPARK_PNG, {
      width: 8,
      height: 8,
      scale: 1,
      padding: 1
    })
  },

  onInit: ({ state }: MinitContext<TectonConfig, TectonState>) => {
    state.cycles = 0;
  },

  onTrigger: ({
    state,
    arena,
    slot,
    config,
    spawn,
    tex,
    playSound
  }: MinitContext<TectonConfig, TectonState>) => {
    state.cycles++;
    const log = slot.log;
    const p = arena.getPixelCoords(log.x, log.y);

    playSound('tecton_pulse', 0.85);

    // Standard seismic pulse straight down
    spawn(
      Archetype.beamVertical({
        dmg: config.pulseDmg,
        length: config.pulseDepth,
        color: 0xffaa00,
        duration: 12,
        renderLaser: true
      })
    );

    // Particle sparks
    const sparkTex = tex('spark');
    if (sparkTex && arena.fxPool) {
      for (let i = 0; i < 5; i++) {
        arena.fxPool.spawnPhysics(
          sparkTex,
          p.px + FastMath.randRange(-6, 6),
          p.py + 8,
          FastMath.randRange(-2, 2),
          FastMath.randRange(1, 3),
          12,
          0.85,
          0.9,
          true
        );
      }
    }

    // Every 4th cycle: Mega Seismic Fissure
    if (state.cycles % config.fissureInterval === 0) {
      playSound('tecton_fissure', 1.0);
      arena.shake = Math.max(arena.shake, config.shake);

      const targetY = arena.clampY(log.y + 3);
      const targetP = arena.getPixelCoords(log.x, targetY);

      if (arena.fxPool) {
        arena.fxPool.spawnShockwave(targetP.px, targetP.py, 0xff7700, 48, 4);
      }

      spawn(
        Archetype.shockwave({
          baseDmg: config.fissureDmg,
          maxRadius: config.fissureRadius * 1.5,
          speed: 1.2,
          color: 0xff5500
        }),
        { x: log.x, y: targetY }
      );
    }
  }
};
