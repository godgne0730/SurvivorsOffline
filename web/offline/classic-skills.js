import {skills, layers} from './classic-skill-data.js';

// These skills own their visuals, including actors that persist beyond a cast.
const independent = new Set(['blitz_beat','detecting','lord_of_vermilion','call_spirits','sight','call_homunculus','summon_flora','graffiti','hindsight','abracadabra','beast_strafing']);
const onSelf = new Set(['impositio','magnificat','weapon_perfection','spear_quicken','twohand_quicken','kaahi','kaizel','kaupe','union','fury','concentration','enchant_poison','cloaking','hiding','sprint']);
const attackStages = ['effectId','effectIdOnCaster','successEffectId','successEffectIdOnCaster','groundEffectId','groundEffectIdByLevel','releaseEffectId'];
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const supported = id => layers[id]?.length || globalThis.ROClassicProcedural?.supports(id);
const canPlay = ids => list(ids).some(supported);
const warmed = new WeakSet();

function active(game,id) {
  return Boolean(skills[id] && !independent.has(id) && game.fxRoom && !game.runItems?.deityLevel?.(id));
}
function scope(game, frame, run) {
  const previous=game.pcSkillFrame;
  game.pcSkillFrame=frame;
  try { return run(); } finally { game.pcSkillFrame=previous; }
}
function point(aim, fallback) {
  if (aim?.kind==='enemy') return aim.e;
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) return aim;
  return fallback;
}
function emit(game,ids,target,source) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
  let played=false;
  for(const id of list(ids)) {
    if (id==='quake' && game.shake) {
      game.shake(0.65,3);
      played=true;
      continue;
    }
    if (!supported(id)) continue;
    if (!game.fxRoom()) return true;
    scope(game,null,()=>{
      for(const layer of layers[id]??[]) {
        const key=layer.keys[Math.floor(Math.random()*layer.keys.length)];
        const draw=()=>{
          if(!game.fxRoom()) return;
          const effect=globalThis.ROClassicNative.str(key,target.x,target.y);
          if(!effect)return;
          if(layer.attachedEntity && ('hp' in target || target===game.player)) effect.anchor=target;
          game.addFx(effect);
        };
        const count=Math.max(1,layer.duplicate??1);
        for(let i=0;i<count;i++){
          const delay=((layer.delay??0)+i*(layer.timeBetweenDupli??0))/1000;
          if(delay>0)game.schedule(delay,draw);else draw();
        }
        played=true;
      }
      if(globalThis.ROClassicProcedural?.play(game,id,target,source)) played=true;
    });
  }
  return played;
}
function warm(game,weapon) {
  if (warmed.has(weapon) || !active(game,weapon.id)) return;
  warmed.add(weapon);
  for(const field of Object.values(skills[weapon.id]))
    for(const id of list(field))
      for(const layer of layers[id]??[])
        for(const key of layer.keys) globalThis.ROClassicNative.warm(key);
}
function cast(game,weapon,frame,aim) {
  const s=skills[weapon.id],actor=game.player,target=point(aim,frame.hitTarget??actor),spot=onSelf.has(weapon.id)?actor:target;
  emit(game,s.effectIdOnCaster,actor,spot);
  emit(game,s.successEffectIdOnCaster,actor,spot);
  emit(game,s.effectId,spot,actor);
  emit(game,s.successEffectId,spot,actor);
  emit(game,s.releaseEffectId,target,actor);
  emit(game,s.beforeHitEffectId,target,actor);
  if(weapon.id!=='fire_wall') {
    emit(game,s.groundEffectId,spot,actor);
    const levels=s.groundEffectIdByLevel;
    if(levels?.length)emit(game,levels[Math.min(levels.length-1,Math.max(0,weapon.level-1))],spot,actor);
  }
}
function bind(weapon) {
  if(!skills[weapon.id]||independent.has(weapon.id)) return weapon;
  const fire=weapon.fire,s=skills[weapon.id];
  const uiStages=attackStages.filter(k=>k!=='releaseEffectId');
  weapon.fire=function(game,aim) {
    if(!active(game,this.id))return fire.call(this,game,aim);
    warm(game,this);
    // A projectile or zone may also carry collision/damage work. Keep its update alive.
    const frame={id:this.id,first:new WeakSet(),mask:uiStages.some(k=>canPlay(s[k]))};
    const fired=scope(game,frame,()=>fire.call(this,game,aim));
    if(fired) {
      this.pcLastFrame=frame;
      cast(game,this,frame,this.shot??aim);
    }
    return fired;
  };
  return weapon;
}
function hit(game,enemy,meta,amount,frame) {
  const id=meta.src;
  if(meta.part || !active(game,id))return false;
  const s=skills[id],player=game.player;
  const scopeFrame=frame?.id===id?frame:game.weapons?.find(w=>w.id===id)?.pcLastFrame;
  let played=false;
  if(amount>0) {
    emit(game,s.damageEffectIdOnCaster,player,enemy);
    played=emit(game,s.damageEffectIdOnTarget,enemy,player);
    if(!scopeFrame?.first.has(enemy)) {
      scopeFrame?.first.add(enemy);
      played=emit(game,s.firstHitEffectId,enemy,player)||played;
    }
  }
  return emit(game,s.hitEffectId,enemy,player)||played;
}
function begin(game,weapon,aim) {
  if(!active(game,weapon.id))return false;
  warm(game,weapon);
  const s=skills[weapon.id];
  emit(game,s.beginCastEffectId,game.player,point(aim,game.player));
  return s.hideCastAura===true;
}
globalThis.ROClassicSkills={bind, warm, begin, hit, scope, emit};
