// EF_BEGINASURA draws each of the six original letters above the monk, starting during the chant.
const glyphURLs=Array.from({length:6},(_,i)=>new URL('./skill-glyphs/asura'+(i+1)+'.png',import.meta.url).href);
let glyphs;
function loadGlyphs() {
  const api=globalThis.ROClassicProcRenderer;
  if(!api?.load)return;
  return glyphs??=Promise.all(glyphURLs.map(url=>api.load(url))).catch(error=>{glyphs=null;throw error;});
}

export function warmMagic(game,id) {
  if(id==='asura_strike'&&!game.runItems?.deityLevel?.(id))
    loadGlyphs()?.catch(error=>console.warn('阿修羅字圖載入失敗',error));
}

const asuraCasts=new WeakMap();
function asura(game,actor,casting) {
  const api=globalThis.ROClassicProcRenderer;
  const started=game.time,hold=Math.max(1200,(casting?.total??0)*1000+400);
  loadGlyphs()?.then(textures=>{
    if(actor.view?.destroyed || game.player!==actor || !game.fxRoom())return;
    let elapsed=Math.max(0,(game.time-started)*1000);
    if(elapsed>=hold+900)return;
    const view=api.container();
    const letters=textures.map(texture=>{
      const sprite=api.sprite(texture);
      sprite.anchor.set(.5);sprite.blendMode='normal';sprite.tint=0x191919;
      view.addChild(sprite);return sprite;
    });
    const effect={view,anchor:actor,upright:true,pcVisible:true,update(ms){
      elapsed+=ms;
      letters.forEach((glyph,i)=>{
        const t=elapsed-i*100;
        glyph.visible=t>=0&&t<hold+400;
        if(!glyph.visible)return;
        const expand=Math.min(1,Math.max(0,(t-hold)/400));
        const size=(2.4+2.6*Math.max(0,1-t/500)+1.6*expand)*api.unit;
        glyph.width=glyph.height=size;
        glyph.alpha=Math.min(1,t/90)*(1-expand);
        glyph.position.set((i-2.5)*2.4*api.unit,-4*api.unit);
      });
      return elapsed>=hold+900||actor.view?.destroyed||(casting?.st.done&&casting.st.progress<.99);
    }};
    effect.update(0);game.addFx(effect);
  }).catch(error=>console.warn('阿修羅字圖載入失敗',error));
}

export function recordedMagicBegin(game,weapon) {
  if(weapon.id==='asura_strike'&&!game.runItems?.deityLevel?.(weapon.id)&&weapon.casting){
    asuraCasts.set(weapon,game.time+weapon.casting.total);
    asura(game,game.player,weapon.casting);
  }
}

// Add the recorded violet light to the current ACT layers, including the chosen hair and outfit.
const activeGlows=new WeakMap();
export function silhouette(game,target,ms,color) {
  const body=target?.sprite,api=globalThis.ROClassicProcRenderer;
  if(!api||!body||body.destroyed||!game.fxRoom())return;
  const originals=body.sprites?[...body.sprites.values()]:body.texture?[body]:[];
  if(!originals.length)return;
  const previous=activeGlows.get(body);
  if(previous&&!previous.destroyed)previous.destroy({children:true});
  const glow=api.container(),controller=api.container();
  // Enemy ACTs consist of a single Sprite, player ACTs are layered Containers.
  const parent=body.sprites?body:body.parent;
  if(!parent)return;
  parent.addChild(glow);activeGlows.set(body,glow);
  const layers=originals.map(original=>{
    const copy=api.sprite(original.texture);
    copy.blendMode='add';copy.tint=color;glow.addChild(copy);return [original,copy];
  });
  controller.once('destroyed',()=>{if(!glow.destroyed)glow.destroy({children:true});});
  let elapsed=0;
  const effect={view:controller,anchor:target,pcVisible:true,update(delta){
    elapsed+=delta;
    if(elapsed>=ms||body.destroyed||glow.destroyed||target.dead)return true;
    const fraction=elapsed/ms;
    glow.alpha=Math.min(1,fraction*12,(1-fraction)*3)*.9;
    for(const [original,copy] of layers){
      copy.visible=original.visible;if(!copy.visible)continue;
      copy.texture=original.texture;copy.anchor.copyFrom(original.anchor);
      copy.position.copyFrom(original.position);copy.scale.copyFrom(original.scale);copy.rotation=original.rotation;
    }
    return false;
  }};
  effect.update(0);game.addFx(effect);
}

const kaBuffs=new Set(['kaahi','kaizel','kaupe']);
const offsets={firebolt:.18,coldbolt:.18,lightning:.18,soul_strike:.18,chain_combo:.17,esma:.20};
const patches={};
for(const [id,burstGap] of Object.entries(offsets))patches[id]={burstGap};
patches.lightning.fxOnHit=false;
patches.finger_offensive={stagger:.18};

patches.jupitel_thunder={view:()=>{
  const r=globalThis.ROClassicProcRenderer,image=r.sprite(r.texture('tex_pok1'));
  image.anchor.set(.5);image.blendMode='add';image.scale.set(.7);
  globalThis.ROClassicProcedural.skinProjectile(93,image);return image;
}};
export function magicConfig(id,game){
  if(game.runItems?.deityLevel?.(id))return;
  if(id==='jupitel_thunder'&&!globalThis.ROClassicProcRenderer)return;
  return patches[id];
}
export function magicMask(id){return kaBuffs.has(id)||id==='estin'||id==='estun'||id==='esma';}

// A single projected layer shows all ground cells. The three screen projections track camera rotation and zoom.
const fields={
  volcano:{color:0xff5052,texture:'tex_pok3',n:7,radius:140},
  deluge:{color:0x76c8ff,texture:'tex_pok3',n:7,radius:140},
  sanctuary:{color:0xbfffb8,texture:'tex_magic_green',n:5,radius:130},
  magnus_exorcismus:{color:0xffd7a8,texture:'tex_magic_green',n:7,radius:120}
};
function field(game,id,center,radius,ms){
  const R=globalThis.ROClassicProcRenderer,config=fields[id];
  if(!config||!R||!game.screenPos||!game.pixelScale||!game.fxRoom())return false;
  const texture=R.texture(config.texture);if(!texture)return false;
  const origin={x:center.x,y:center.y},view=R.container(),cells=[],m=(config.n-1)/2;
  for(let y=-m;y<=m;y++)for(let x=-m;x<=m;x++){
    if(id==='sanctuary'&&Math.abs(x)+Math.abs(y)>3)continue;
    if(id==='magnus_exorcismus'&&Math.abs(x)>1&&Math.abs(y)>1)continue;
    const sprite=R.sprite(texture);sprite.anchor.set(.5);sprite.blendMode='add';sprite.tint=config.color;
    view.addChild(sprite);cells.push({x,y,sprite,phase:Math.random()*Math.PI*2});
  }
  let elapsed=0;
  const effect={view,anchor:origin,upright:true,pcVisible:true,update(delta){
    elapsed+=delta;if(elapsed>=ms)return true;
    const step=radius/(m+.5),p=game.screenPos(origin.x,origin.y,0),ax=game.screenPos(origin.x+step,origin.y,0),ay=game.screenPos(origin.x,origin.y+step,0);
    const scale=game.pixelScale(origin.x,origin.y);if(scale<=0)return false;
    const fade=Math.min(1,elapsed/220,(ms-elapsed)/280);
    for(const c of cells){
      const pulse=(1+Math.sin(elapsed/330+c.phase))*.5;
      c.sprite.position.set(((ax.x-p.x)*c.x+(ay.x-p.x)*c.y)/scale,((ax.y-p.y)*c.x+(ay.y-p.y)*c.y)/scale);
      c.sprite.width=step*(2.8+.4*pulse);c.sprite.height=step*(2.15+.3*pulse);
      const spread=Math.max(0,Math.min(1,(elapsed-Math.hypot(c.x,c.y)*75)/220));
      c.sprite.alpha=fade*spread*(.11+.09*pulse);
    }
    return false;
  }};
  effect.update(0);game.addFx(effect);return true;
}

export function recordedMagicField(game,x,y,radius,ms){
  const frame=game.pcSkillFrame,id=frame?.id;
  if(!fields[id]||id==='magnus_exorcismus'||game.runItems?.deityLevel?.(id))return false;
  if(!field(game,id,{x,y},radius,ms))return false;
  frame.fieldHandled=true;
  return true;
}

export function recordedMagicCast(game,weapon,actor,target,emit,frame) {
  const id=weapon.id;
  if(game.runItems?.deityLevel?.(id))return false;
  if(kaBuffs.has(id)){
    const chant=id==='kaizel'?1850:id==='kaupe'?360:0,R=globalThis.ROClassicProcRenderer;
    const blue=chant&&R?.texture('tex_magic_blue');
    if(blue&&game.cylinder){
      game.cylinder(actor.x,actor.y,{texture:blue,bottom:1.4*R.unit,top:1.3*R.unit,height:3.2*R.unit,
        duration:chant,alpha:.85,color:[.55,.65,1],rotate:true,follow:()=>actor});
      game.schedule(chant/1000,()=>{if(!actor.dead&&!actor.view?.destroyed)silhouette(game,actor,id==='kaupe'?1450:1850,0xb24dff);});
    }else silhouette(game,actor,id==='kaupe'?1450:1850,0xb24dff);
    return true;
  }
  if(id==='fury'){
    actor.pose?.('pickup');
    silhouette(game,actor,850,0xff624e);
  }
  if(id==='asura_strike'){
    const expected=asuraCasts.get(weapon);asuraCasts.delete(weapon);
    if(expected===undefined||Math.abs(game.time-expected)>.12)asura(game,actor);
  }
  if(id==='estin'||id==='estun'){
    emit(game,265,target,actor);
    if(id==='estun')emit(game,'ef_sl_stun',target,actor);
    return true;
  }
  if(id==='jupitel_thunder')return true;
  if(fields[id]){
    const mod=weapon.mod?.(game)??{},radius=fields[id].radius*(game.stats?.areaMult??1)*(1+(mod.area??0));
    const center=id==='magnus_exorcismus'?target:actor;
    const ms=id==='magnus_exorcismus'?((weapon.cfg?.ticks(weapon.level)??6)+(mod.count??0))*(weapon.cfg?.interval??.42)*1000:8000*(1+(mod.duration??0));
    if(!frame?.fieldHandled&&!field(game,id,center,radius,ms))return false;
    const casting={volcano:225,deluge:236,sanctuary:83,magnus_exorcismus:113};
    emit(game,casting[id],center,actor);
    return true;
  }
  return false;
}

export function jupitelHits(game) {
  const weapon=game.weapons?.find(w=>w.id==='jupitel_thunder');
  return 2+Math.max(1,Math.min(10,weapon?.level??1));
}

export function recordedMagicHit(game,id,enemy,frame,emit) {
  if(game.runItems?.deityLevel?.(id))return false;
  if(id==='estin'||id==='estun'){
    silhouette(game,enemy,id==='estin'?200:300,0x7040ff);return true;
  }
  if(id==='esma'){
    silhouette(game,enemy,190,0x9685ff);emit(game,0,enemy,game.player);return true;
  }
  if(id==='frost_nova'&&!frame?.first?.has(enemy))emit(game,28,enemy,game.player);
  if(id==='jupitel_thunder'){
    const hits=jupitelHits(game);
    for(let i=0;i<hits;i++){
      const draw=()=>{if(!enemy.dead&&game.fxRoom())emit(game,94,enemy,game.player);};
      if(i===0)draw();else game.schedule(i*.18,draw);
    }
    return true;
  }
  if(id==='fire_pillar'&&frame){
    if(!frame.erupted){emit(game,97,frame.ground??enemy,game.player);frame.erupted=true;}
    return true;
  }
  return false;
}

// The combat orbs still run their collision checks. Draw the recorded orbit in its own holder.
const orbitSkills=new Set(['sight','ruwach','call_spirits']);
export function bindMagicOrbit(weapon){
  if(!orbitSkills.has(weapon.id)||typeof weapon.update!=='function')return;
  const update=weapon.update;
  let art,count=0,wasActive=false,orbClock=0;
  weapon.update=function(dt,game){
    const normal=!game.runItems?.deityLevel?.(this.id),cfg=this.cfg;
    const replace=normal&&game.screenPos&&game.pixelScale&&globalThis.ROClassicProcRenderer;
    const nativeTrail=replace&&this.id==='ruwach'&&cfg.onOrb;
    if(nativeTrail)cfg.onOrb=undefined;
    try {update.call(this,dt,game);} finally {if(nativeTrail)cfg.onOrb=nativeTrail;}
    if(!replace){
      if(art){art.visible=false;for(const orb of this.orbs)orb.renderable=true;}
      wasActive=false;return;
    }
    const R=globalThis.ROClassicProcRenderer,active=this.activeLeft>0;
    if(!active){if(art)art.visible=false;wasActive=false;return;}
    const spiritual=this.id==='call_spirits',fire=this.id==='sight';
    const texture=R.texture('tex_pok3');
    if(!texture)return;
    if(!art||art.destroyed){
      art=R.container();
      for(let i=0;i<(spiritual?5:9);i++){
        const sprite=R.sprite(texture);sprite.anchor.set(.5);sprite.blendMode='add';
        sprite.tint=fire?(i<3?0xff9429:0xc73c09):spiritual?0x9f9bff:0x80dbff;
        art.addChild(sprite);
      }
      this.holder.addChild(art);
    }
    for(const orb of this.orbs)orb.renderable=false;
    if(!wasActive){orbClock=0;if(spiritual)count=Math.min(count+1,5);}
    wasActive=true;art.visible=true;orbClock+=dt;
    const actor=game.player,radius=spiritual?26:cfg.radius,cycle=fire?1:spiritual?2.3:.85;
    for(let i=0;i<art.children.length;i++){
      const sprite=art.children[i];sprite.visible=!spiritual||i<count;
      if(!sprite.visible)continue;
      const angle=orbClock*Math.PI*2/cycle+(spiritual?i*2*Math.PI/count:-i*.14);
      const x=actor.x+Math.cos(angle)*radius,y=actor.y+Math.sin(angle)*radius;
      const p=game.screenPos(x,y,spiritual?52:30),scale=game.pixelScale(x,y);
      const size=spiritual?19:fire?27:35;
      sprite.position.set(p.x,p.y);sprite.width=sprite.height=size*scale*(spiritual?1:1-i*.055);
      sprite.alpha=spiritual?.9:1-i*.105;
    }
  };
}
