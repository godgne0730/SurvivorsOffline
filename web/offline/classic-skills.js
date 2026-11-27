import './desktop-martial.js';
import {bindMagicOrbit,magicConfig,magicMask,recordedMagicField,warmMagic,recordedMagicBegin,recordedMagicCast,recordedMagicHit} from './video-magic.js';
import {prepareKick, topple} from './video-kicks.js';
import {skills, layers} from './classic-skill-data.js';

// These skills own their visuals, including actors that persist beyond a cast.
const independent = new Set(['blitz_beat','detecting','lord_of_vermilion','call_spirits','sight','call_homunculus','summon_flora','graffiti','hindsight','abracadabra','beast_strafing']);
const onSelf = new Set(['impositio','magnificat','weapon_perfection','spear_quicken','twohand_quicken','kaahi','kaizel','kaupe','union','fury','concentration','enchant_poison','cloaking','hiding','sprint','grand_cross','auto_guard','heal','blessing','signum_crucis','crazy_uproar','desperado','raid','axe_tornado']);
const attackStages = ['effectId','effectIdOnCaster','successEffectId','successEffectIdOnCaster','groundEffectId','groundEffectIdByLevel','releaseEffectId'];
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const supported = id => layers[id]?.length || globalThis.ROClassicProcedural?.supports(id);
const canPlay = ids => list(ids).some(supported);
const warmed = new WeakSet();

// These releases use the body ACT's skill gesture even when a weapon is equipped.
const recordedBowWindups=new Set(['double_strafe','arrow_repel','beast_strafing','phantasmic_arrow']);
const spellGestures = new Set([
  'concentration','provoke','crazy_uproar','auto_guard','grand_cross','spear_quicken',
  'enchant_poison','venom_dust','divest_weapon','steal_coin','weapon_perfection',
  'chemical_protection','lightning_strike','flaming_petals'
]);
function unenhanced(game, weapon) {
  return Object.hasOwn(skills,weapon.id) && !(game.runItems?.deityLevel?.(weapon.id)>0);
}
function holdChant(game,weapon,state,duration) {
  const actor=game.player;
  if(!unenhanced(game,weapon)||!actor?.sprite?.sheets?.body||!actor.pose||actor.dead||actor.sitting)return false;
  actor.pose('cast');
  actor.sprite.classicClip={start:0,count:1,chant:state};
  actor.castLock=duration;
  state.desktopSkill=weapon.id;
  actor.pcChant=state;
  return true;
}
// Colors at cast start in the archived desktop clips. Ground spells can use a different
// ring from their damage element (Meteor Storm is gold and Earth Spike is pale).
const chantRings={
  firebolt:['tex_ring_white',[1,.68,.53]],
  coldbolt:['tex_ring_blue',[.65,.75,1]],
  lightning:['tex_ring_white',[.85,1,.9]],
  earth_spike:['tex_ring_white',[.9,1,.92]],
  meteor_storm:['tex_ring_yellow',[1,1,.85]]
};
function chantAura(game,state,duration) {
  const style=chantRings[state.desktopSkill],api=globalThis.ROClassicProcRenderer;
  const texture=style&&api?.texture(style[0]);
  if(!texture||!game.cylinder)return false;
  // Narrow inner light, foot ring and outward flare. The original ring texture fades
  // vertically. Keep its base attached until the cast ends or is interrupted.
  const actor=game.player,unit=api.unit;
  for(const [bottom,top,height,alpha,animation] of [[1,1,8,.24,1],[1,1.3,1.4,.65,1],[1,3.2,2.3,.72,2]]){
    game.cylinder(actor.x,actor.y,{texture,bottom:bottom*unit,top:top*unit,height:height*unit,
      duration,alpha,animation,rotate:true,fade:true,color:style[1],follow:()=>actor,
      castState:state});
  }
  return true;
}
function endChant(actor,state) {
  if(actor.pcChant!==state)return;
  actor.pcChant=null;
  if(actor.sprite.classicClip?.chant===state){
    actor.castLock=0;
    actor.sprite.classicClip=null;
  }
}
function releaseGesture(game,weapon) {
  const actor=game.player;
  if(!unenhanced(game,weapon)||!actor?.pose||actor.dead||actor.sitting)return false;
  if(recordedBowWindups.has(weapon.id))actor.pose('ready');
  else if(spellGestures.has(weapon.id))actor.pose('cast');
  else if(weapon.id==='graffiti')actor.pose('pickup');
  else if(weapon.id==='call_homunculus'||weapon.id==='detecting')actor.pose('idle');
  else return false;
  return true;
}

function active(game,id) {
  return Boolean(skills[id] && !independent.has(id) && game.fxRoom && !(id==='thunderstorm'&&game.stats?.firestorm));
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
    if (globalThis.ROMartialPlayback?.archivedAxe(game,id,target,source)) { played=true; continue; }
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
  warmMagic(game,weapon.id);
  globalThis.ROMartialPlayback?.warmRecording(game,weapon.id);
  for(const field of Object.values(skills[weapon.id]))
    for(const id of list(field))
      for(const layer of layers[id]??[])
        for(const key of layer.keys) globalThis.ROClassicNative.warm(key);
}
function meteor(game, weapon, x, y) {
  return active(game,weapon.id) && weapon.id==='meteor_storm' &&
    emit(game,skills[weapon.id].effectId,{x,y},game.player);
}
function bowFlash(game) {
  if(!game.fxRoom?.()||!game.player)return;
  const actor=game.player;
  if(!globalThis.ROClassicProcedural?.bowWindup(game,actor))emit(game,16,actor,actor);
  game.schedule(.38,()=>{if(!actor.dead&&!actor.sitting)actor.attack();});
}
function status(game,id,enemy) {
  return id==='provoke' && active(game,id) && emit(game,skills[id].successEffectId,enemy,game.player);
}
const boltStages = {firebolt:'damageEffectIdOnTarget',coldbolt:'damageEffectIdOnTarget',lightning:'damageEffectIdOnTarget',frost_diver:'damageEffectIdOnCaster',soul_strike:'damageEffectIdOnCaster'};
function launchSpell(game,weapon,enemy,index,count) {
  const id=weapon.id,field=boltStages[id];
  if(!field || !active(game,id))return false;
  if(id==='lightning'&&unenhanced(game,weapon)&&game.pcSkillFrame){
    const targets=game.pcSkillFrame.lightningTargets??=new WeakSet();
    if(targets.has(enemy))return true;
    targets.add(enemy);
  }
  const caster=field==='damageEffectIdOnCaster', player=game.player;
  const played=id==='soul_strike'?soul(game,player,enemy,index,count):
    emit(game,skills[id][field],caster?player:enemy,caster?enemy:player);
  if(played&&game.pcSkillFrame)game.pcSkillFrame.launched=true;
  return played;
}
// Original EF_SOULSTRIKE uses twelve time-offset particle1 images along a 40-tick curve.
function soul(game, source, enemy, index, count) {
  const R=globalThis.ROClassicProcRenderer;
  if(!R?.sheet || !game.screenPos || !game.pixelScale)return false;
  if(!game.fxRoom())return true;
  const origin={x:source.x,y:source.y},dx=enemy.x-source.x,dy=enemy.y-source.y,distance=Math.hypot(dx,dy);
  const countPC=Math.max(1,Math.min(7,count)),step=[0,1,180,90,60,45,30,25][countPC];
  const angle=((1+index%countPC)*step-(countPC===1?0:90))*Math.PI/180,unit=R.unit/5;
  const dirX=distance?dx/distance:0,dirY=distance?dy/distance:1;
  const draw=()=>{
    if(game.player?.view?.destroyed || game.world?.destroyed || !game.fxRoom())return;
    const view=R.container(),sprites=[];
    for(let i=0;i<12;i++) {
      const sprite=R.sheet('fx_particle1',0);
      sprite.blendMode='add';sprite.alpha=(254/255)*(1-i/12);sprite.scale.set(2.75*(1-i/24));sprite.visible=false;
      view.addChild(sprite);sprites.push(sprite);
    }
    let elapsed=0;
    game.addFx({view,anchor:origin,upright:true,update(ms) {
      elapsed+=ms;
      const tick=Math.floor(elapsed*60/1000);
      if(tick>=40)return true;
      const center=game.screenPos(origin.x,origin.y,0),scale=game.pixelScale(origin.x,origin.y);
      if(scale<=0)return false;
      for(let i=0;i<sprites.length;i++) {
        const n=tick+1-i,sprite=sprites[i];sprite.visible=n>=1;
        if(!sprite.visible)continue;
        const along=n*distance/40-(3.5*n-.175*n*(n+1)/2)*unit;
        const bow=(-2*n+.1*n*(n-1)/2)*unit,side=bow*Math.sin(angle);
        const p=game.screenPos(origin.x+dirX*along+dirY*side,origin.y+dirY*along-dirX*side,10*unit-bow*Math.cos(angle));
        sprite.position.set((p.x-center.x)/scale,(p.y-center.y)/scale);
        sprite.update(ms);
      }
      return false;
    }});
  };
  const pending=R.prepareSheet('fx_particle1');
  if(pending)pending.then(draw).catch(error=>console.warn('桌機技能圖層載入失敗',error));else draw();
  return true;
}
function cast(game,weapon,frame,aim) {
  const s=skills[weapon.id],actor=game.player,target=point(aim,frame.hitTarget??actor),spot=onSelf.has(weapon.id)?actor:target;
  if(aim?.kind==='ground')frame.ground={x:aim.x,y:aim.y};
  if(recordedMagicCast(game,weapon,actor,target,emit,frame))return;
  if(weapon.id==='flaming_petals'&&unenhanced(game,weapon))return;
  if(unenhanced(game,weapon) && ['bash','envenom','mammonite'].includes(weapon.id))emit(game,16,actor,spot);
  if(weapon.id==='acid_terror' && unenhanced(game,weapon))emit(game,12,actor,spot);
  emit(game,s.effectIdOnCaster,actor,spot);
  emit(game,s.successEffectIdOnCaster,actor,spot);
  const victims=aim?.kind==='enemy'&&!onSelf.has(weapon.id)?new Set(aim.all?.length?aim.all:[spot]):[spot];
  for(const victim of victims) {
    if(weapon.id!=='meteor_storm' && weapon.id!=='decrease_agi')emit(game,s.effectId,victim,actor);
    if(weapon.id!=='provoke')emit(game,s.successEffectId,victim,actor);
  }
  if(weapon.id!=='arrow_shower')emit(game,s.releaseEffectId,target,actor);
  // A collision projectile already draws the thrown weapon all the way to impact or return.
  if(!(weapon.cfg?.view&&weapon.cfg.speed&&globalThis.ROClassicProcedural?.isProjectile?.(s.beforeHitEffectId)))
    emit(game,s.beforeHitEffectId,target,actor);
  if(weapon.id!=='fire_wall') {
    emit(game,s.groundEffectId,spot,actor);
    const levels=s.groundEffectIdByLevel;
    if(levels?.length)emit(game,levels[Math.min(levels.length-1,Math.max(0,weapon.level-1))],spot,actor);
  }
}
function bind(weapon) {
  bindMagicOrbit(weapon);
  if(!skills[weapon.id]||independent.has(weapon.id)) return weapon;
  prepareKick(weapon);
  const fire=weapon.fire,s=skills[weapon.id];
  const uiStages=attackStages.filter(k=>k!=='releaseEffectId');
  weapon.fire=function(game,aim) {
    if(!active(game,this.id))return fire.call(this,game,aim);
    warm(game,this);
    // A projectile or zone may also carry collision/damage work. Keep its update alive.
    const frame={id:this.id,first:new WeakSet(),mask:(unenhanced(game,this)&&magicMask(this.id))||uiStages.some(k=>canPlay(s[k]))};
    const original=this.cfg,changes=original&&magicConfig(this.id,game);
    let fired;
    if(changes)this.cfg={...original,...changes};
    try {fired=scope(game,frame,()=>fire.call(this,game,aim));}
    finally {if(changes)this.cfg=original;}
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
  // A brief target spark follows living arrows. The large radial flash belongs at the bow.
  if(amount>0 && ['double_strafe','arrow_shower','arrow_repel','phantasmic_arrow'].includes(id) && !(game.runItems?.deityLevel?.(id)>0))
    return emit(game,0,enemy,player);
  const scopeFrame=frame?.id===id?frame:game.weapons?.find(w=>w.id===id)?.pcLastFrame;
  let played=false;
  if(amount>0) {
    if(id==='roundhouse'&&!(game.runItems?.deityLevel?.(id)>0))topple(game,enemy);
    if(recordedMagicHit(game,id,enemy,scopeFrame,emit))return true;
    if(globalThis.ROMartialPlayback?.recordedContact(game,id,enemy,emit))return true;
    if(id==='flaming_petals'&&!(game.runItems?.deityLevel?.(id)>0))return emit(game,s.effectId,enemy,player);
    const bowAlreadyFlashed=(id==='double_strafe'||id==='arrow_repel') && !(game.runItems?.deityLevel?.(id)>0);
    if(!bowAlreadyFlashed && (!frame?.launched || boltStages[id]!=='damageEffectIdOnCaster'))emit(game,s.damageEffectIdOnCaster,player,enemy);
    // Double Strafe releases both arrows from the bow; damage only supplies their impact flashes.
    if(id!=='double_strafe' && (!frame?.launched || boltStages[id]!=='damageEffectIdOnTarget'))
      played=emit(game,s.damageEffectIdOnTarget,enemy,player);
    if(!scopeFrame?.first.has(enemy)) {
      scopeFrame?.first.add(enemy);
      played=emit(game,s.firstHitEffectId,enemy,player)||played;
    }
  }
  if(id==='decrease_agi') emit(game,s.effectId,enemy,player);
  return emit(game,s.hitEffectId,enemy,player)||played;
}
function begin(game,weapon,aim) {
  if(!active(game,weapon.id))return false;
  warm(game,weapon);
  const s=skills[weapon.id];
  recordedMagicBegin(game,weapon);
  emit(game,s.beginCastEffectId,game.player,point(aim,game.player));
  return s;
}
const projectileEffect=id=>skills[id]?.beforeHitEffectId;
globalThis.ROClassicSkills={recordedMagicField,unenhanced,holdChant,chantAura,endChant,releaseGesture,projectileEffect,bowFlash,bind, warm, begin, hit, scope, emit, meteor, status, launchSpell};
