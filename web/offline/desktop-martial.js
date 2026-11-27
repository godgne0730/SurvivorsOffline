import {jupitelHits} from './video-magic.js';

// Times are seconds from contact to the first visible figure and between figures in the PC recordings.
// A visual subdivision never deals damage or runs on-hit triggers again.
const series = {
  jupitel_thunder: {parts: jupitelHits, delay: 0, gap: .18},
  tornado_kick: {parts: 3, delay: .08, gap: .18},
  heel_drop: {parts: 3, delay: .08, gap: .18},
  counter_kick: {parts: 3, delay: .08, gap: .18},
  solar_burst: {parts: 3, delay: .08, gap: .18},
  falling_star: {parts: 3, delay: 0, gap: .18},
  axe_tornado: {parts: 2, delay: .32, gap: .20},
  pierce: {parts: 1, delay: .42, gap: .26},
  holy_cross: {parts: 1, delay: .46, gap: .20},
  sonic_blow: {parts: 1, delay: .42, gap: .20},
  bowling_bash: {parts: 1, delay: .40, gap: .24}
};

function numbers(game, enemy, meta, amount, height, color, critical, frame) {
  const spec = series[meta.src];
  if (!spec || !amount || meta.part || game.runItems?.deityLevel(meta.src) !== 0) return false;
  // Each simultaneous cast and victim owns its total, including delayed projectiles and echoes.
  if (!frame || frame.id !== meta.src) frame = {};
  const targets = frame.desktopFigures ??= new WeakMap();
  let state = targets.get(enemy);
  if (!state) {
    state = {start: game.time, index: 0, total: 0, label: null};
    targets.set(enemy, state);
  }
  const parts = Math.min(typeof spec.parts === 'function' ? spec.parts(game) : spec.parts, amount);
  const x = enemy.x, y = enemy.y;
  for (let part = 0; part < parts; part++) {
    const value = Math.round(amount * (part + 1) / parts) - Math.round(amount * part / parts);
    const delay = Math.max(0, state.start + spec.delay + state.index++ * spec.gap - game.time);
    game.schedule(delay, () => {
      const px = enemy.dead || enemy.removed ? x : enemy.x;
      const py = enemy.dead || enemy.removed ? y : enemy.y;
      game.addNumber(value, px, py, height, color, critical ? 1.8 : 1.6, critical);
      state.total += value;
      if (!state.label || state.label.dead) {
        state.label = game.addNumber(state.total, px, py, height + 26, 0xffdf46, 1.45, false);
      } else {
        state.label.setValue(state.total, 0xffdf46, false);
      }
    });
  }
  return true;
}


const transientBuffs = new Set(['spear_quicken', 'auto_guard', 'weapon_perfection', 'endure', 'chemical_protection', 'crazy_uproar']);
function visibleAuras(game, buffs) {
  const sprite = game.player.sprite;
  const quicken = game.ext.quickenUntil > game.time && game.runItems?.deityLevel('spear_quicken') === 0;
  if (quicken && sprite) {
    if (sprite.desktopTint === undefined) sprite.desktopTint = sprite.tint;
    sprite.tint = 0xffc52f;
  } else if (sprite?.desktopTint !== undefined) {
    sprite.tint = sprite.desktopTint;
    delete sprite.desktopTint;
  }
  return buffs.filter(buff => {
    if (buff.skill === 'hiding' && game.desktopConcealed) return false;
    return !transientBuffs.has(buff.skill) || game.runItems?.deityLevel(buff.skill) !== 0;
  });
}

// The desktop field is two perpendicular 48 × 6.4 walls and four concave quarter arcs.
// Mesh coordinates here use five renderer units to the cell, as in the effect rows.
function grandCross(game, ground) {
  const renderer = globalThis.ROClassicProcRenderer;
  if (!renderer || !game.world3d?.scene) return false;
  const light = renderer.texture('tex_alpha_center'), gold = renderer.texture('tex_ring_yellow');
  if (!light || !gold) return false;
  function wall(paths, texture, intensity) {
    const shape = {xyz: [], uv: [], additive: true};
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1], [bx, bz] = path[i];
        shape.xyz.push(ax,0,az, bx,0,bz, ax,60,az, ax,60,az, bx,0,bz, bx,60,bz);
        shape.uv.push(0,1, 1,1, 0,0, 0,0, 1,1, 1,0);
      }
    }
    shape.motion = tick => ({
      offset: [0, 0, 0],
      height: Math.max(.001, Math.sin(Math.min(90, tick) * Math.PI / 180)),
      alpha: Math.max(0, Math.min(1, tick / 10, (112 - tick) / 90)) * intensity
    });
    renderer.model(game, shape, ground, texture, 2000);
  }
  const arm = [[-24,-3.2],[24,-3.2],[24,3.2],[-24,3.2],[-24,-3.2]];
  wall([arm, arm.map(([x,z]) => [-z,x])], light, 1);
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const path = [];
    for (let i = 0; i <= 12; i++) {
      const angle = Math.PI * i / 24;
      path.push([sx*(23-19.9*Math.cos(angle)), sz*(23-19.9*Math.sin(angle))]);
    }
    corners.push(path);
  }
  wall(corners, gold, 1);
  return true;
}

// Before the desktop renewal of these skills the equipped axe ACT supplied the swing.
function archivedAxe(game, effect, target, caster) {
  if (effect === 'ef_nc_axetornado') {
    if (game.runItems?.deityLevel('axe_tornado') !== 0) return false;
    caster.attack?.();
    return true;
  }
  if (!['ef_nc_axeboomerang_cast','ef_nc_axeboomerang','ef_nc_axeboomerang_hit'].includes(effect)
      || game.runItems?.deityLevel('axe_boomerang') !== 0) return false;
  if (effect === 'ef_nc_axeboomerang_cast' && game.cylinder) {
    const renderer = globalThis.ROClassicProcRenderer, texture = renderer?.texture('tex_ring_blue');
    if (!texture) return false;
    const cell = renderer.unit;
    game.cylinder(target.x, target.y, {
      texture, top: cell * 2.25, bottom: cell * .6, height: cell * 4,
      alpha: .95, color: [.72,.79,1], fade:true, animation:2, duration:540, follow:()=>target
    });
  }
  return true;
}

const recordings = {
  sand_attack: {asset:'sprinkle-sand-pc.png', width:127, height:143, groundX:63, groundY:135, delay:0, additive:true},
  intimidate: {asset:'intimidate-pc.png', width:282, height:270, groundX:132, groundY:178, delay:.30, additive:false}
};
const loadedRecordings = new Map();

function warmRecording(game, skill) {
  const clip = recordings[skill], renderer = globalThis.ROClassicProcRenderer;
  if (!clip || !renderer || !game.world3d?.scene || game.runItems?.deityLevel(skill) !== 0) return null;
  if (!loadedRecordings.has(skill)) {
    const entry = {frames:null};
    entry.loading = renderer.load(new URL('./classic-procedural/'+clip.asset, import.meta.url).href).then(atlas => {
      atlas.source.scaleMode='nearest';
      entry.frames = Array.from({length:13}, (_,i) => {
        const rect=atlas.frame.clone();
        rect.x=(i%4)*clip.width; rect.y=Math.floor(i/4)*clip.height;
        rect.width=clip.width; rect.height=clip.height;
        return new atlas.constructor({source:atlas.source,frame:rect});
      });
    }).catch(() => { loadedRecordings.delete(skill); });
    loadedRecordings.set(skill,entry);
  }
  return loadedRecordings.get(skill);
}

function recordedContact(game, skill, victim, emit) {
  const entry=warmRecording(game,skill);
  if (!entry) return false;
  const clip=recordings[skill], renderer=globalThis.ROClassicProcRenderer;
  const anchor={x:victim.x,y:victim.y}, start=game.time+clip.delay;
  emit(game,0,victim,game.player);
  const draw=() => {
    if (!entry.frames || game.world?.destroyed || !game.fxRoom()) return;
    const index=()=>Math.max(0,Math.floor((game.time-start)*15));
    if (index()>=entry.frames.length) return;
    const view=renderer.container(), sprite=renderer.sprite(entry.frames[index()]);
    sprite.scale.set(.52); sprite.anchor.set(clip.groundX/clip.width,clip.groundY/clip.height);
    if (clip.additive) sprite.blendMode='add';
    view.addChild(sprite);
    game.addFx({view,anchor,upright:true,update(){
      const frame=index();
      if (frame>=entry.frames.length) return true;
      sprite.texture=entry.frames[frame];
      return false;
    }});
  };
  const loadAndDraw=()=>{ if(entry.frames)draw(); else entry.loading.then(draw); };
  if (clip.delay>0) game.schedule(clip.delay,loadAndDraw); else loadAndDraw();
  return true;
}

globalThis.ROMartialPlayback = {numbers, visibleAuras, grandCross, archivedAxe, warmRecording, recordedContact};
