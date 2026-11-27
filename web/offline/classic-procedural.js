/* Desktop effect rows use milliseconds, map cells and percentage sprite sizes. */
(function installClassicEffects(rows) {
  const host=globalThis;
  const base=new URL('./classic-procedural/',import.meta.url);
  const textures=new Map(), loading=new Map();
  const renderer=()=>host.ROClassicProcRenderer;
  const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
  const value=(v,fallback=0)=>Array.isArray(v)?v[0]+Math.random()*(v[1]-v[0]):(v??fallback);
  const between=(a,b,t)=>a+(b-a)*t;
  const radians=angle=>angle*Math.PI/180;
  const lookup=name=>name?.startsWith('@')?renderer().texture(name.slice(1)):textures.get(name);
  function load(name){
    if(lookup(name))return null;
    if(name.startsWith('@'))return null;
    if(!loading.has(name)){
      loading.set(name,renderer().load(new URL(name,base).href).then(texture=>{
        texture.source.scaleMode='nearest';textures.set(name,texture);
      }).finally(()=>loading.delete(name)));
    }
    return loading.get(name);
  }
  function alive(game){return !!game.player&&!game.player.view?.destroyed&&!game.world?.destroyed}
  function direction(source,target){
    return Math.atan2(target.y-source.y,target.x-source.x);
  }
  function shotAngle(game,from,to,lift) {
    if(!game.screenPos)return direction(from,to);
    const a=game.screenPos(from.x,from.y,lift),b=game.screenPos(to.x,to.y,lift);
    return Math.atan2(b.y-a.y,b.x-a.x);
  }
  // CArrowEffect advances one map cell per 24 ms, for up to eight frames.
  function arrowFlight(from,to) {
    return Math.max(1,Math.min(192,24*Math.hypot(to.x-from.x,to.y-from.y)/renderer().unit));
  }
  function point(target,attached){return attached?target:{x:target.x,y:target.y}}
  function asColor(r,g,b){return (Math.round(clamp(r)*255)<<16)|(Math.round(clamp(g)*255)<<8)|Math.round(clamp(b)*255)}
  function sprite(game,row,target,source,duration){
    const R=renderer(),sheet=row.sheet,frames=row.images??[];
    const shaft=sheet==='fx_arrow'||sheet==='fx_spear';
    const image=sheet?R.sheet(sheet,shaft?2:row.direction?(source.sprite?.dir??0):0):R.sprite(lookup(frames[0]));
    const view=R.container();view.addChild(image);
    const fixed=point(target,row.attachedEntity),from=point(source,false);
    const anchor={x:fixed.x,y:fixed.y},unit=R.unit;
    const cell=(axis,phase)=>{
      const key='pos'+axis;
      return (value(row[key+phase],value(row[key]))+value(row[key+phase+'RandMiddle'])+
        (Math.random()*2-1)*value(row[key+phase+'Rand'],value(row[key+'Rand'])))*unit;
    };
    const begin=[cell('x','Start'),cell('y','Start'),cell('z','Start')];
    const end=['x','y','z'].map((k,i)=>Object.keys(row).some(key=>key.startsWith('pos'+k+'End'))?cell(k,'End'):begin[i]);
    const size=(axis,phase)=>{
      const range=row['sizeRand'+phase+axis];
      return value(range,value(row['size'+phase+axis],value(row['size'+phase],value(row['size'+axis],value(row.size,100)))))+
        (range?0:(Math.random()*2-1)*value(row['sizeRand'+axis],value(row.sizeRand)))+value(row['sizeRand'+axis+'Middle']);
    };
    const w0=size('X','Start'),h0=size('Y','Start');
    const endW=row.sizeEndX!==undefined||row.sizeEnd!==undefined||row.sizeRandEndX;
    const endH=row.sizeEndY!==undefined||row.sizeEnd!==undefined||row.sizeRandEndY;
    const w1=endW?size('X','End'):w0,h1=endH?size('Y','End'):h0;
    const angle=radians(value(row.angleRand,value(row.angle)));
    const circleAngle=angle-Math.PI/2,inner=value(row.circleInnerSize)*unit,outer=value(row.circleOuterSizeRand)*unit;
    if(!sheet)image.anchor.set(.5,row.anchorY??.5);
    image.blendMode=shaft||row.blendMode===1?'normal':'add';
    image.tint=asColor(row.red??1,row.green??1,row.blue??1);
    let elapsed=0, sampled=false;
    const fx={view,anchor,upright:true,lift:0,update(ms){
      elapsed+=ms;
      const t=clamp(elapsed/duration),q=row.sizeSmooth?t*t*(3-2*t):t;
      const ox=between(begin[0],end[0],t),oy=between(begin[1],end[1],t);
      anchor.x=(row.toSrc?between(from.x,fixed.x,t):fixed.x)+ox;
      anchor.y=(row.toSrc?between(from.y,fixed.y,t):fixed.y)+oy;
      fx.lift=between(begin[2],end[2],t)+(target.arrowLift??0)+(row.zOffset??0)*unit+(row.head?70:0);
      if(row.circlePattern){image.x=Math.cos(circleAngle)*between(inner,outer,t);image.y=Math.sin(circleAngle)*between(inner,outer,t)-30;}
      if(frames.length>1)image.texture=lookup(frames[Math.floor(elapsed/(row.frameDelay??100))%frames.length]);
      if(sheet){image.dir=row.direction?(source.sprite?.dir??0):0;image.update(ms)}
      const w=between(w0,w1,q),h=between(h0,h1,q);
      if(row.type==='2D'||row.type==='3D'&&!sheet&&!row.playSprite){image.width=Math.max(.01,w);image.height=Math.max(.01,h);}
      else image.scale.set(Math.max(.01,w/100),Math.max(.01,h/100));
      const heading=row.rotateToTarget?shotAngle(game,from,fixed,fx.lift):0;
      // ACT a2 points left for the skeleton arrow and right for the spear.
      image.rotation=(shaft?(sheet==='fx_arrow'?Math.PI:0):angle)+heading+(row.rotate?t*Math.PI*2*(row.nbOfRotation??1):0);
      const fade=(row.fadeIn?clamp(t*4):1)*(row.fadeOut||row.fade?clamp((1-t)*3):1);
      image.alpha=clamp(value(row.alphaMax,1),0,1)*fade*(row.sparkling ? .65+.35*Math.abs(Math.cos(t*Math.PI*(row.sparkNumber??3))) : 1);
      // Even an adjacent-cell shot must reach the screen once at a low frame rate.
      if(shaft&&ms>0&&ms<=100&&!sampled){
        sampled=true;
        if(t>=1){image.alpha=1;return false;}
      }
      return t>=1;
    }};
    fx.update(0);game.addFx(fx);
  }
  function cylinder(game,row,target,source,duration){
    const R=renderer(),unit=R.unit,horn=row.type==='QuadHorn'||row.type==='heaven';
    const anchor=point(target,row.attachedEntity), dx=value(row.posX,value(row.offsetX))*unit,dy=value(row.posY,value(row.offsetY))*unit;
    const top=horn?0:value(row.topSize)*unit,base=value(row.bottomSize)*unit;
    const axisRotation=axis=>radians(value(row['rotate'+axis],value(row['angle'+axis]))+Math.random()*value(row['angle'+axis+'Random']));
    const yRotation=axisRotation('Y')+(row.rotateWithSource?Math.atan2(source.facingY??1,source.facingX??0):0);
    const location=()=>({x:anchor.x+dx,y:anchor.y+dy});
    const opts={texture:lookup(row.images[0]),top,bottom:base,height:value(row.height)*unit,
      duration,alpha:row.alphaMax??row.color?.[3]??1,color:row.color??[row.red??1,row.green??1,row.blue??1],
      animation:row.animation,rotate:row.rotate,fade:row.fade??true,follow:location,
      classic:{sides:horn?4:row.totalCircleSides,arc:horn?4:row.circleSides,
        repeats:row.repeatTextureX,rx:axisRotation('X'),ry:yRotation,rz:axisRotation('Z'),
        fieldPhase:row.propertyGround?Math.random()*Math.PI*2:undefined,
        normal:row.blendMode===1,lift:value(row.posZ,value(row.offsetZ))*unit,horn,animationOut:row.animationOut,
        rise:value(row.riseDistance)*unit,fadeOut:row.fadeOut,speed:row.animationSpeed}};
    game.cylinder(anchor.x+dx,anchor.y+dy,opts);
  }
  function tile(game,row,target,duration){
    const R=renderer(),unit=R.unit;
    const center=point(target,false),tiles=R.graphic(),view=R.container(),texture=lookup(row.images[0]);
    // The PC renderer repeats one coloured cell and its hovering symbol across the song area.
    const symbols=[];
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
      tiles.rect((x-.5)*unit,(y-.5)*unit,unit,unit);
      const icon=R.sprite(texture);icon.anchor.set(.5);icon.x=x*unit;icon.y=y*unit;icon.width=unit*.5;icon.height=unit*.5;icon.alpha=.7;
      view.addChild(icon);symbols.push([icon,y*unit]);
    }
    tiles.fill({color:row.color,alpha:.05});view.addChildAt(tiles,0);
    let elapsed=0;game.addFx({view,anchor:center,upright:false,update(ms){
      elapsed+=ms;for(const [icon,y] of symbols)icon.y=y-2+2*Math.sin(elapsed/300);return elapsed>=duration;
    }});
  }
  const randomInt=n=>Math.floor(Math.random()*n);
  const tickMs=1000/60;
  // Coordinates in the desktop primitives are five units to one map cell, Y is up here.
  function surface(points,faces,uvs){
    return {xyz:faces.flatMap(indices=>indices.flatMap(i=>points[i])),uv:uvs.flat(2)};
  }
  function boltMesh(step,length,width){
    const norm=Math.hypot(...step),axis=step.map(x=>x/norm),[x,y,z]=axis,flat=Math.hypot(x,z);
    const sides=[[-z/flat,0,x/flat],[y*x/flat,-flat,y*z/flat]];
    const points=[],faces=[],uvs=[];
    for(const side of sides){
      const base=points.length;
      for(const along of [-1,1])for(const across of [-1,1])points.push(axis.map((a,i)=>a*length*along+side[i]*width*across));
      faces.push([base,base+2,base+1],[base+2,base+3,base+1]);
      uvs.push([[0,1],[1,1],[0,0]],[[1,1],[1,0],[0,0]]);
    }
    return surface(points,faces,uvs);
  }
  function ringMesh(segments){
    const points=[],faces=[],uvs=[];
    for(let i=0;i<segments;i++){
      const start=2*Math.PI*i/segments,end=2*Math.PI*(i+1)/segments,base=points.length;
      for(const angle of [start,end])for(const radius of [0,1])points.push([Math.cos(angle)*radius,0,Math.sin(angle)*radius]);
      faces.push([base,base+1,base+2],[base+2,base+1,base+3]);
      uvs.push([[i/segments,0],[i/segments,1],[(i+1)/segments,0]],[[(i+1)/segments,0],[i/segments,1],[(i+1)/segments,1]]);
    }
    return surface(points,faces,uvs);
  }
  function boltRain(game,row,target){
    const fire=row.kind==='fire',count=clamp(Math.floor(target.hitCount)||1,1,50);
    const frames=row.images.slice(0,fire?6:1).map(lookup),ring=lookup(row.images[fire?6:1]);
    const bolts=[];
    for(let i=0;i<count;i++){
      const x=25+randomInt(10),z=15+randomInt(10),aimX=randomInt(4)-2,aimZ=randomInt(4)-2;
      const heading=Math.atan2(aimZ-z,aimX-x),slope=Math.atan2(60,Math.hypot(x,z)),hz=2.75*Math.cos(slope);
      const step=[Math.cos(heading)*hz,-2.75*Math.sin(slope),Math.sin(heading)*hz];
      const flight=Math.ceil(60/-step[1]),start=12+10*i;
      const coord=t=>[x,60,z].map((v,axis)=>v+step[axis]*Math.min(t,flight));
      const shape=boltMesh(step,fire?14:11.5,fire?3.5:3.8);shape.additive=true;shape.frames=frames;
      shape.motion=t=>({offset:coord(t),alpha:clamp((flight+25-t)/20),frame:Math.floor(t)%frames.length});
      game.schedule(start/60,()=>{if(alive(game))renderer().model(game,shape,target,frames[0],(flight+25)*tickMs)});
      const ringShape=ringMesh(10);ringShape.additive=true;
      ringShape.motion=t=>({offset:[0,.15,0],radius:Math.max(.001,1.2*t-(1.2/70)*t*(t+1)),band:10,alpha:clamp(t/10)*clamp((30-t)/10)});
      game.schedule((start+flight)/60,()=>{if(alive(game))renderer().model(game,ringShape,target,ring,30*tickMs)});
      bolts.push({start,coord,step,flight,heading,slope});
    }
    if(!fire)return;
    // Only the newest live bolt sheds sparks. The spark travels back up its line.
    for(let tick=12;tick<Math.min(160,bolts.at(-1).start+bolts.at(-1).flight+25);tick+=4){
      const current=bolts[Math.min(count-1,Math.floor((tick-12)/10))];
      const start=current.coord(tick-current.start),life=6+randomInt(24),speed=(60+randomInt(90))/100;
      const h=current.heading+radians(randomInt(40)-20),p=current.slope+radians(randomInt(20)-10);
      const dist=speed*life*(2/3),flat=Math.cos(p)*dist;
      const end=[start[0]-Math.cos(h)*flat,start[1]+Math.sin(p)*dist,start[2]-Math.sin(h)*flat];
      const spark={type:'SPR',images:['particle4-0.png'],posxStart:start[0]/5,posyStart:start[2]/5,poszStart:start[1]/5,
        posxEnd:end[0]/5,posyEnd:end[2]/5,poszEnd:end[1]/5,sizeStart:20+randomInt(30),sizeEnd:1,fadeOut:true};
      game.schedule(tick/60,()=>{if(alive(game))sprite(game,spark,target,target,life*tickMs)});
    }
  }
  function iceSpikes(game,row,target,source){
    const path=row.kind==='path',unit=renderer().unit/5,dx=target.x-source.x,dy=target.y-source.y;
    const distance=Math.hypot(dx,dy)/unit,heading=Math.atan2(dy,dx);
    const count=path?clamp(1+Math.ceil((distance-7.5)/2),1,150):8;
    for(let i=0;i<count;i++){
      const along=path?Math.min(distance,5+i*2):0,turn=radians(randomInt(360)),radius=(path?5+randomInt(10):1+randomInt(4))/10;
      const x=Math.cos(heading)*along+Math.cos(turn)*radius,z=Math.sin(heading)*along+Math.sin(turn)*radius;
      const w=(path?60+randomInt(40):100+randomInt(250))/100,height=(path?150+randomInt(30):200+randomInt(100))/10;
      const yaw=radians(randomInt(360)),pitch=radians(path?75+randomInt(30):80+randomInt(20));
      const axis=[Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw)];
      const right=[-Math.sin(yaw),0,Math.cos(yaw)],front=[-Math.sin(pitch)*Math.cos(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.sin(yaw)];
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>right.map((v,j)=>w*(v*a+front[j]*b)));
      points.push(axis.map(v=>v*height));
      const faces=[],uvs=[];for(let j=0;j<4;j++){faces.push([j,4,(j+1)%4]);uvs.push([[j/4,1],[j/4,0],[(j+1)/4,1]]);}
      const shape=surface(points,faces,uvs);
      shape.motion=t=>{const age=Math.min(t,20),rise=3*age-.075*age*(age+1);return {offset:[x+axis[0]*rise,-30+axis[1]*rise,z+axis[2]*rise],alpha:(path?254:200)/255*clamp((40-t)/10)};};
      const draw=()=>{if(alive(game))renderer().model(game,shape,path?source:target,lookup(row.images[0]),40*tickMs)};
      if(path&&i)game.schedule(i/60,draw);else draw();
    }
  }
  function heavenDrive(game,row,target,source){
    const unit=renderer().unit;
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
      cylinder(game,row,{x:target.x+(x+.2)*unit,y:target.y+(y+.2)*unit},source,1000);
    }
    game.shake?.(.2,3);
  }
  function sonicTurn(target){
    if(!target.sprite)return;
    const dir=((target.sprite.dir??0)+2)%8;
    if(typeof target.face==='function'&&Number.isFinite(target.faceX)&&Number.isFinite(target.faceY)){
      target.face(-target.faceY,target.faceX);
    }else target.sprite.dir=dir;
  }

  function render(game,row,target,source){
    const duration=Number.isFinite(target.durationMs)?Math.max(1,target.durationMs):
      row.sheet==='fx_arrow'?arrowFlight(source,target):value(row.durationRand,value(row.duration,650));
    if(row.type==='boltRain')return boltRain(game,row,target);
    if(row.type==='ice')return row.kind==='path'?iceSpikes(game,row,source,target):iceSpikes(game,row,target,source);
    if(row.type==='heaven')return heavenDrive(game,row,target,source);
    if(row.type==='turn')return sonicTurn(target);
    if(row.type==='RSM')return renderer().model(game,row,target,lookup(row.images[0]),duration);
    if(row.type==='tile')return tile(game,row,target,duration);
    if(row.type==='TRAIL'){
      const start=point(source,false),finish=point(target,false),dist=Math.hypot(finish.x-start.x,finish.y-start.y);
      const count=Math.min(32,Math.max(2,Math.ceil(dist/(renderer().unit*.3))));
      for(let i=0;i<count;i++)game.schedule(i*(row.interval??50)/1000,()=>{
        const t=i/(count-1),p={x:between(start.x,finish.x,t),y:between(start.y,finish.y,t)};
        for(const part of row.spawn)render(game,part,p,source);
      });
      return;
    }
    if(row.type==='QuadHorn'||row.type==='CYLINDER')return cylinder(game,row,target,source,duration);
    sprite(game,row,target,source,duration);
  }
  function dispatch(game,row,target,source){
    const names=row.images??row.spawn?.flatMap(part=>part.images??[])??[];
    const pending=names.map(load).filter(Boolean);
    const sheet=row.sheet&&renderer().prepareSheet(row.sheet);if(sheet)pending.push(sheet);
    const go=()=>{
      if(!alive(game))return;
      const count=Math.max(1,row.duplicate??1);
      for(let i=0;i<count;i++){
        const delay=(row.delayOffset??row.delayStart??row.delayLate??0)+i*(row.timeBetweenDupli??0);
        if(delay>0)game.schedule(delay/1000,()=>{if(alive(game))render(game,row,target,source)});
        else render(game,row,target,source);
      }
    };
    if(pending.length)Promise.all(pending).then(go).catch(error=>console.warn('桌機技能圖層載入失敗',error));else go();
  }
  host.ROClassicProcedural={
    supports:id=>Object.hasOwn(rows,id),
    isProjectile:id=>rows[id]?.some(row=>row.toSrc)??false,
    arrowFlight,
    preloadArrows(){
      const pending=renderer()?.prepareSheet('fx_arrow');
      if(pending)pending.catch(error=>console.warn('箭矢圖集載入失敗',error));
    },
    shootArrow(game,from,to,durationMs,lane=0){
      return this.play(game,'ef_arrow_projectile',{x:to.x,y:to.y,durationMs,arrowLift:lane*renderer().unit*.15},{x:from.x,y:from.y});
    },
    arrowShower(game,from,targets){
      const drawn=new Set(),unit=renderer().unit;
      for(const enemy of targets){
        for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
          const spot={x:enemy.x+x*unit,y:enemy.y+y*unit};
          const cell=Math.round(spot.x/unit)+','+Math.round(spot.y/unit);
          if(drawn.has(cell))continue;
          if(game.fxRoom&&!game.fxRoom())return;
          drawn.add(cell);
          this.shootArrow(game,from,spot,arrowFlight(from,spot));
        }
      }
    },
    skinProjectile(id,view){
      const row=rows[id]?.find(layer=>layer.toSrc),name=row?.images?.[0];
      if(!name||!renderer()||!('texture' in view))return;
      const apply=()=>{if(!view.destroyed){view.texture=lookup(name);view.tint=0xffffff;}};
      const pending=load(name);if(pending)pending.then(apply).catch(error=>console.warn('投射物圖像載入失敗',error));else apply();
    },
    play(game,id,target,source=game.player){
      if(!this.supports(id)||!renderer()||!alive(game)||!Number.isFinite(target?.x)||!Number.isFinite(target?.y))return false;
      source=source&&Number.isFinite(source.x)&&Number.isFinite(source.y)?source:target;
      for(const row of rows[id])dispatch(game,row,target,source);
      return true;
    },
    spiritSphere(){
      const R=renderer(),key='thunder_center.png',view=R.container();
      const draw=()=>{if(view.destroyed)return;const ring=R.sprite(lookup(key));ring.anchor.set(.5);ring.width=20;ring.height=20;ring.blendMode='add';view.addChild(ring);};
      const pending=load(key);if(pending)pending.then(draw).catch(()=>{});else draw();
      return view;
    }
  };
})({
"0": [{"type":"3D","duplicate":4,"timeBetweenDupli":0,"duration":300,"alphaMax":0.8,"alphaMin":0.3,"fadeIn":true,"fadeOut":true,"poszStart":1,"posxStart":0,"posyStart":0,"posxEndRand":2,"posyEndRand":2,"poszEndRand":2,"zIndex":1,"size":10,"red":1,"green":1,"blue":1,"sizeRand":20,"sizeSmooth":true,"attachedEntity":false,"sparkling":true,"images":["@tex_pok3"]}],
"1": [{"alphaMax":12,"angleRand":[0,35],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens1"]},{"alphaMax":12,"angleRand":[50,85],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens2"]},{"alphaMax":12,"angleRand":[100,135],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens1"]},{"alphaMax":12,"angleRand":[150,185],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens2"]},{"alphaMax":12,"angleRand":[200,235],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens1"]},{"alphaMax":12,"angleRand":[255,290],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens2"]},{"alphaMax":12,"angleRand":[300,335],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens1"]},{"alphaMax":12,"angleRand":[340,360],"attachedEntity":false,"duration":250,"durationRand":[200,350],"fadeOut":true,"fade":true,"sizeEndX":1,"sizeRandEndY":[250,300],"sizeRandStartX":[25,40],"sizeRandStartY":[10,10],"circlePattern":true,"circleOuterSizeRand":[5,6],"circleInnerSize":2.2,"type":"2D","overlay":true,"zIndex":1,"images":["@tex_lens2"]}],
"11": [{"type":"3D","alphaMax":1,"attachedEntity":true,"duration":1000,"fadeIn":true,"fadeOut":true,"posz":2,"sizeEnd":70,"sizeSmooth":true,"sizeStart":200,"zIndex":10,"images":["endure.png"]}],
"12": [{"type":"CYLINDER","alphaMax":0.8,"blendMode":2,"animation":2,"attachedEntity":true,"bottomSize":1,"fade":true,"height":4,"rotate":false,"topSize":5,"images":["@tex_ring_yellow"]}],
"15": [{"alphaMax":1,"attachedEntity":true,"blue":1,"duration":200,"delayLate":250,"fadeIn":true,"fadeOut":true,"toSrc":true,"green":1,"poszEnd":1,"poszSmooth":true,"poszStartRand":5,"poszStartRandMiddle":6,"red":1,"size":50,"timeBetweenDupli":150,"type":"3D","zIndex":1,"images":["@tex_pok3"]}],
"16": [{"type":"CYLINDER","alphaMax":0.6,"duration":1000,"rotate":true,"fade":true,"angleX":-90,"fixedPerspective":true,"posZ":1.5,"height":0,"bottomSize":0.1,"topSize":2,"animation":2,"zIndex":1,"attachedEntity":true,"images":["@tex_alpha_down"]},{"type":"CYLINDER","alphaMax":0.6,"duration":1000,"duplicate":10,"timeBetweenDupli":0,"totalCircleSides":30,"circleSides":1,"rotate":true,"fade":true,"angleX":-90,"angleZRandom":360,"fixedPerspective":true,"posZ":1.5,"height":0,"bottomSize":0.01,"topSize":2.5,"animation":2,"zIndex":1.1,"attachedEntity":true,"images":["@tex_alpha_center"]},{"type":"CYLINDER","alphaMax":0.6,"duration":1000,"duplicate":8,"timeBetweenDupli":0,"totalCircleSides":30,"circleSides":1,"rotate":true,"fade":true,"angleX":-90,"angleZRandom":360,"fixedPerspective":true,"posZ":1.5,"height":0,"bottomSize":0.01,"topSize":4,"animation":2,"zIndex":1.2,"attachedEntity":true,"images":["@tex_alpha_center"]}],
"17": [{"type":"CYLINDER","alphaMax":0.7,"animation":4,"attachedEntity":true,"bottomSize":4,"duration":300,"fade":true,"height":1,"rotate":true,"topSize":6,"images":["@tex_ring_yellow"]},{"type":"CYLINDER","alphaMax":0.6,"animation":4,"attachedEntity":true,"bottomSize":4,"duration":300,"fade":true,"height":4,"rotate":true,"topSize":1,"images":["@tex_bigbang"]}],
"20": [{"alphaMax":1,"attachedEntity":true,"blue":1,"duration":1000,"duplicate":10,"fadeIn":true,"fadeOut":true,"green":0.7,"posxRand":1,"posyRand":1,"poszEnd":5,"poszStart":0,"red":1,"size":100,"sizeRand":20,"type":"3D","zIndex":1,"images":["@tex_pok1"]}],
"38": [{"alphaMax":1,"attachedEntity":true,"duration":1000,"duplicate":20,"fadeOut":true,"posxRand":1.5,"posyRand":1,"poszEndRand":1,"poszEndRandMiddle":1,"poszStartRand":1,"poszStartRandMiddle":6,"sizeRandY":15,"sizeRandYMiddle":45,"sizeX":2.5,"type":"3D","zIndex":0,"images":["@tex_ac_center2"]},{"alphaMax":1,"attachedEntity":true,"duration":1000,"fadeIn":true,"fadeOut":true,"poszEnd":0.4,"poszStart":2.8,"sizeEnd":100,"sizeSmooth":true,"sizeStart":100,"sizeY":45,"type":"3D","zIndex":10,"images":["@tex_slow"]}],
"42": [{"type":"SPR","attachedEntity":true,"delayFrame":30,"frame":0,"repeat":true,"duration":1500,"stackable":true,"head":true,"yOffset":-120,"sheet":"fx_blessing"},{"alphaMax":1,"attachedEntity":true,"duration":1200,"delayOffset":300,"duplicate":6,"fadeIn":true,"fadeOut":true,"posxRand":1.2,"posyRand":1,"poszEndRand":0.5,"poszEndRandMiddle":1,"poszStartRand":2,"poszStartRandMiddle":5.5,"size":50,"sparkling":true,"sparkNumber":2,"timeBetweenDupli":0,"type":"3D","zIndex":1,"sheet":"fx_particle6"},{"alphaMax":1,"attachedEntity":true,"duration":1200,"delayOffset":400,"duplicate":6,"fadeIn":true,"fadeOut":true,"posxRand":1.4,"posyRand":1.1,"poszEndRand":0.5,"poszEndRandMiddle":1,"poszStartRand":2,"poszStartRandMiddle":5.5,"size":50,"timeBetweenDupli":0,"type":"3D","zIndex":1,"sheet":"fx_particle6"},{"alphaMax":0.3,"attachedEntity":false,"blendMode":2,"blue":1,"duration":2500,"fadeIn":true,"fadeOut":true,"green":0.75,"posx":0,"posy":0,"posz":0,"red":0.1,"size":140,"type":"3D","zIndex":10,"images":["@tex_pok2"]}],
"79": [{"type":"QuadHorn","attachedEntity":false,"duration":5000,"height":[0.95,1.5],"offsetX":[0.4,0.6],"offsetY":[0.4,0.6],"offsetZ":-0.1,"bottomSize":[0.5,0.6],"blendMode":1,"rotateY":[1,360],"rotateZ":[-8,8],"color":[1,1,1,1],"animation":3,"animationSpeed":120,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":5000,"height":[0.2,0.4],"offsetX":[0,0],"offsetY":[0.5,0.5],"offsetZ":-0.1,"bottomSize":[0.1,0.2],"blendMode":1,"rotateY":[1,360],"rotateZ":[-15,15],"color":[1,1,1,1],"animation":2,"animationSpeed":100,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":5000,"height":[0.2,0.4],"offsetX":[0,0.5],"offsetY":[0.5,1],"offsetZ":-0.1,"bottomSize":[0.1,0.2],"blendMode":1,"rotateY":[1,360],"rotateZ":[-15,15],"color":[1,1,1,1],"animation":2,"animationSpeed":100,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":5000,"height":[0.2,0.4],"offsetX":[1,1.2],"offsetY":[0.5,0.8],"offsetZ":-0.1,"bottomSize":[0.1,0.2],"blendMode":1,"rotateY":[1,360],"rotateZ":[-15,15],"color":[1,1,1,1],"animation":2,"animationSpeed":100,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":5000,"height":[0.2,0.4],"offsetX":[0.5,0.7],"offsetY":[0,-0.2],"offsetZ":-0.1,"bottomSize":[0.1,0.2],"blendMode":1,"rotateY":[1,360],"rotateZ":[-15,15],"color":[1,1,1,1],"animation":2,"animationSpeed":100,"animationOut":true,"images":["stone.png"]}],
"93": [{"type":"3D","duration":200,"size":35,"toSrc":true,"blendMode":2,"overlay":true,"alphaMax":0.66,"images":["thunder_center.png"]},{"type":"3D","frameDelay":10,"duration":200,"size":45,"toSrc":true,"overlay":true,"blendMode":2,"images":["thunder_ball_a.png","thunder_ball_b.png","thunder_ball_c.png","thunder_ball_d.png","thunder_ball_e.png","thunder_ball_f.png"]}],
"94": [{"type":"3D","duration":100,"sizeStart":0,"sizeEnd":25,"blendMode":2,"rotateToTarget":true,"fadeOut":true,"overlay":true,"attachedEntity":true,"images":["thunder_pang.png"]},{"type":"3D","frameDelay":10,"duration":300,"size":75,"blendMode":2,"overlay":true,"attachedEntity":true,"images":["thunder_plazma_blast_a.png","thunder_plazma_blast_b.png","thunder_ball_d.png","thunder_ball_e.png","thunder_ball_f.png"]}],
"121": [{"type":"3D","blendMode":2,"duration":400,"alphaMax":1,"fadeOut":true,"sizeStart":100,"sizeEnd":300,"zIndex":10,"attachedEntity":true,"images":["ring2.png"]}],
"123": [{"type":"TRAIL","attachedEntity":false,"duration":2500,"speed":24,"interval":50,"stopAtTarget":true,"overshoot":3,"spawn":[{"type":"QuadHorn","attachedEntity":false,"duration":670,"height":[0.6,1],"offsetX":0,"offsetY":0,"offsetZ":0,"bottomSize":[0.05,0.1],"blendMode":8,"rotateX":[-15,15],"rotateY":[0,360],"color":[1,1,1,1],"animation":4,"animationSpeed":330,"riseDistance":0.8,"fadeOut":170,"images":["stone.png"]}]}],
"132": [{"type":"QuadHorn","attachedEntity":false,"duration":15000,"height":2.5,"offsetX":0.5,"offsetY":0.4,"offsetZ":-0.2,"bottomSize":0.15,"blendMode":1,"rotateX":-15,"rotateY":0,"rotateZ":0,"color":[1,1,1,1],"animation":3,"animationSpeed":120,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":15000,"height":2.5,"offsetY":0.5,"bottomSize":0.15,"blendMode":1,"rotateX":5,"rotateY":45,"rotateZ":-15,"color":[1,1,1,1],"animation":3,"animationSpeed":120,"animationOut":true,"images":["stone.png"]},{"type":"QuadHorn","attachedEntity":false,"duration":15000,"height":2.5,"offsetX":0.5,"offsetY":0.5,"offsetZ":0,"bottomSize":0.15,"blendMode":1,"rotateX":5,"rotateY":45,"rotateZ":15,"color":[1,1,1,1],"animation":3,"animationSpeed":120,"animationOut":true,"images":["stone.png"]}],
"138": [{"type":"CYLINDER","attachedEntity":false,"topSize":2,"bottomSize":1,"height":3,"duration":5000,"delayOffset":1000,"rotate":true,"images":["@tex_magic_red"]},{"type":"CYLINDER","attachedEntity":false,"topSize":1.5,"bottomSize":0.7,"height":5,"duration":5000,"delayOffset":1000,"rotate":true,"images":["@tex_magic_red"]},{"type":"CYLINDER","attachedEntity":false,"topSize":1,"bottomSize":0.5,"height":7,"duration":5000,"delayOffset":1000,"rotate":true,"images":["@tex_magic_red"]}],
"171": [{"type":"3D","alphaMax":1,"attachedEntity":true,"duration":100,"size":80,"poszStart":0,"poszEnd":0.5,"repeat":true,"images":["particle3-0.png"],"anchorY":0.5,"frameDelay":100}],
"226": [{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-2,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-3,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-4,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":2,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":3,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":4,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":2,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":3,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":4,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":-1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":-2,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":-3,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posY":-4,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":1,"posY":1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":1,"posY":-1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-1,"posY":-1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":4,"circleSides":4,"topSize":0.7,"bottomSize":0.7,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":45,"duplicate":3,"timeBetweenDupli":500,"posX":-1,"posY":1,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":20,"circleSides":5,"topSize":3,"bottomSize":3,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":-180,"duplicate":3,"timeBetweenDupli":500,"posX":3.5,"posY":3.5,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":20,"circleSides":5,"topSize":3,"bottomSize":3,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":90,"duplicate":3,"timeBetweenDupli":500,"posX":3.5,"posY":-3.5,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":20,"circleSides":5,"topSize":3,"bottomSize":3,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":0,"duplicate":3,"timeBetweenDupli":500,"posX":-3.5,"posY":-3.5,"images":["ring_red.png"]},{"type":"CYLINDER","alphaMax":0.1,"animation":1,"attachedEntity":false,"blendMode":2,"totalCircleSides":20,"circleSides":5,"topSize":3,"bottomSize":3,"duration":1000,"fade":true,"height":5,"rotate":false,"angleY":-90,"duplicate":3,"timeBetweenDupli":500,"posX":-3.5,"posY":3.5,"images":["ring_red.png"]}],
"261": [{"type":"CYLINDER","alphaMax":0.5,"blendMode":8,"animation":4,"duplicate":4,"timeBetweenDupli":100,"bottomSize":2,"duration":1500,"fade":true,"height":2,"rotate":true,"topSize":5,"attachedEntity":true,"images":["@tex_ring_yellow"]}],
"262": [{"type":"3D","duplicate":12,"timeBetweenDupli":0,"delayStart":250,"duration":550,"alphaMax":0.8,"fadeIn":true,"fadeOut":true,"posxStart":0,"posyStart":0,"posxEndRand":40,"posyEndRand":40,"sizeStartX":10,"sizeStartY":150,"sizeEndX":10,"sizeEndY":150,"blendMode":2,"attachedEntity":true,"overlay":true,"rotateToTarget":true,"rotateWithCamera":true,"images":["@tex_alpha_center"]}],
"263": [{"type":"CYLINDER","alphaMax":0.3,"blendMode":8,"animation":4,"duplicate":4,"timeBetweenDupli":100,"bottomSize":3,"duration":1000,"fade":true,"height":2,"rotate":true,"topSize":6,"attachedEntity":true,"images":["@tex_ring_yellow"]}],
"265": [{"type":"3D","alphaMax":1,"blendMode":2,"duration":150,"toSrc":true,"rotateWithCamera":true,"rotateToTarget":true,"angle":90,"zOffset":1,"size":50,"attachedEntity":true,"images":["blue_ivy.png"]}],
"266": [{"type":"3D","duplicate":24,"timeBetweenDupli":0,"delayStart":100,"duration":550,"alphaMax":0.8,"fadeIn":true,"fadeOut":true,"posxStart":0,"posyStart":0,"posxEndRand":40,"posyEndRand":40,"sizeStartX":10,"sizeStartY":150,"sizeEndX":10,"sizeEndY":150,"blendMode":2,"attachedEntity":true,"overlay":true,"rotateToTarget":true,"rotateWithCamera":true,"images":["@tex_lens1"]}],
"274": [{"type":"2D","overlay":true,"blendMode":2,"alphaMax":0.8,"duplicate":30,"timeBetweenDupli":50,"duration":1500,"fadeOut":true,"posxEndRand":10,"posyEndRand":10,"posz":2,"size":20,"rotateToTarget":true,"attachedEntity":true,"images":["coin_a.png"]}],
"276": [{"type":"3D","duplicate":20,"timeBetweenDupli":0,"delayStart":100,"duration":550,"alphaMax":0.8,"fadeIn":true,"fadeOut":true,"posxStart":0,"posyStart":0,"posxEndRand":40,"posyEndRand":40,"sizeStartX":10,"sizeStartY":150,"sizeEndX":10,"sizeEndY":150,"blendMode":2,"attachedEntity":true,"red":0.1,"green":0.1,"blue":1,"overlay":true,"rotateToTarget":true,"rotateWithCamera":true,"images":["@tex_lens1"]}],
"298": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":300,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":0.5,"size":30,"zOffset":1,"zIndex":1,"images":["acid-bottle.png"]}],
"302": [{"type":"SPR","attachedEntity":false,"images":["demonstration-0.png","demonstration-1.png","demonstration-2.png","demonstration-3.png","demonstration-4.png"],"anchorY":0.8613138686131386,"frameDelay":100}],
"308": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":200,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":0.5,"size":20,"zOffset":1,"zIndex":1,"images":["stone-item.png"]}],
"312": [{"alphaMax":0.2,"animation":1,"attachedEntity":true,"blendMode":2,"blue":0.7,"bottomSize":0.95,"duration":1500,"fade":true,"green":1,"height":8,"red":0.7,"rotate":true,"topSize":0.95,"type":"CYLINDER","images":["@tex_ring_white"]},{"alphaMax":0.2,"animation":1,"attachedEntity":true,"blendMode":2,"blue":0.7,"bottomSize":1,"duration":1500,"fade":true,"green":1,"height":8,"red":0.7,"rotate":true,"topSize":1,"type":"CYLINDER","images":["@tex_ring_white"]},{"alphaMax":0.6,"attachedEntity":true,"blendMode":2,"blue":1,"duration":1300,"delayOffset":400,"duplicate":15,"fadeIn":true,"fadeOut":true,"green":1,"posxRand":1.5,"posyRand":1.5,"poszEndRand":2,"poszEndRandMiddle":6,"poszStart":0,"red":1,"size":9,"sizeRand":2,"timeBetweenDupli":10,"type":"3D","zIndex":1,"images":["@tex_pok3"]},{"alphaMax":0.6,"attachedEntity":true,"blendMode":2,"blue":1,"duration":1100,"delayLate":200,"duplicate":7,"fadeIn":true,"fadeOut":true,"green":1,"posxRand":1,"posyRand":1,"poszEnd":5,"poszStartRand":1,"poszStartRandMiddle":0,"red":1,"size":9,"sizeRand":2,"timeBetweenDupli":50,"type":"3D","zIndex":1,"images":["@tex_pok3"]}],
"318": [{"alphaMax":0.2,"animation":0,"attachedEntity":true,"blendMode":2,"totalCircleSides":4,"circleSides":4,"bottomSize":0.7,"duration":50000,"fade":false,"height":5,"rotate":false,"topSize":0.7,"type":"CYLINDER","angleY":45,"images":["ring_red.png"]},{"alphaMax":0.1,"animation":1,"attachedEntity":true,"blendMode":2,"totalCircleSides":4,"circleSides":4,"bottomSize":0.7,"duration":2000,"fade":true,"height":5,"rotate":false,"topSize":0.7,"type":"CYLINDER","angleY":45,"repeat":true,"images":["ring_red.png"]}],
"319": [{"alphaMax":0.3,"animation":0,"attachedEntity":true,"blendMode":2,"blue":0.5,"totalCircleSides":4,"circleSides":4,"bottomSize":0.7,"duration":50000,"fade":false,"green":0.9,"height":2,"red":0.5,"rotate":false,"topSize":0.7,"type":"CYLINDER","angleY":45,"images":["@tex_magic_green"]},{"alphaMax":0.1,"animation":1,"attachedEntity":true,"blendMode":2,"blue":0.5,"totalCircleSides":4,"circleSides":4,"bottomSize":0.7,"duration":2000,"fade":true,"green":0.9,"height":2,"red":0.5,"rotate":false,"topSize":0.7,"type":"CYLINDER","angleY":45,"repeat":true,"images":["@tex_magic_green"]}],
"320": [{"alphaMax":0.2,"animation":1,"attachedEntity":true,"blendMode":2,"blue":1,"bottomSize":0.95,"duration":1000,"fade":true,"green":1,"height":10,"red":1,"rotate":true,"topSize":0.95,"type":"CYLINDER","images":["@tex_ring_white"]},{"alphaMax":0.2,"animation":1,"attachedEntity":true,"blendMode":2,"blue":1,"bottomSize":1,"duration":1000,"fade":true,"green":1,"height":9,"red":1,"rotate":true,"topSize":1,"type":"CYLINDER","images":["@tex_ring_white"]},{"alphaMax":0.8,"attachedEntity":true,"blendMode":2,"blue":1,"duration":1000,"delayOffset":400,"duplicate":10,"fadeIn":true,"fadeOut":true,"green":1,"posxRand":1.5,"posyRand":1.5,"poszEndRand":3,"poszEndRandMiddle":6,"poszStart":0,"red":1,"size":9,"sizeRand":2,"sparkling":true,"sparkNumber":2,"timeBetweenDupli":10,"type":"3D","zIndex":1,"images":["@tex_pok3"]},{"alphaMax":0.8,"attachedEntity":true,"blendMode":2,"blue":1,"duration":900,"delayLate":200,"duplicate":5,"fadeIn":true,"fadeOut":true,"green":1,"posxRand":1,"posyRand":1,"poszEnd":6,"poszStartRand":1,"poszStartRandMiddle":0,"red":1,"size":9,"sizeRand":2,"sparkling":true,"sparkNumber":2,"timeBetweenDupli":50,"type":"3D","zIndex":1,"images":["@tex_pok3"]}],
"336": [{"type":"CYLINDER","blendMode":2,"duration":600,"fade":true,"totalCircleSides":8,"circleSides":5,"repeatTextureX":5,"angleY":112.5,"bottomSize":1.5,"topSize":1,"height":0.7,"posZ":2.14,"alphaMax":0.6,"red":0.91,"green":1,"blue":0.9,"rotateWithSource":true,"attachedEntity":true,"images":["guardk.png"]},{"type":"CYLINDER","blendMode":2,"duration":600,"fade":true,"totalCircleSides":8,"circleSides":5,"repeatTextureX":5,"angleY":112.5,"bottomSize":1.5,"topSize":1.5,"height":1.14,"posZ":1,"alphaMax":0.6,"red":0.91,"green":1,"blue":0.9,"rotateWithSource":true,"attachedEntity":true,"images":["guardk.png"]},{"type":"CYLINDER","blendMode":2,"duration":600,"fade":true,"totalCircleSides":8,"circleSides":5,"repeatTextureX":5,"angleY":112.5,"bottomSize":1,"topSize":1.5,"height":0.7,"posZ":0.3,"alphaMax":0.6,"red":0.91,"green":1,"blue":0.9,"rotateWithSource":true,"attachedEntity":true,"images":["guardk.png"]}],
"600": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":200,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":1,"size":30,"zOffset":1,"zIndex":1,"images":["venom-knife.png"]}],
"613": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":200,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":1,"size":30,"zOffset":1,"zIndex":1,"images":["shuriken.png"]}],
"614": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":200,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":1,"size":30,"zOffset":1,"zIndex":1,"images":["kunai.png"]}],
"615": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":200,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":1,"size":30,"zOffset":1,"zIndex":1,"images":["huuma.png"]}],
"637": [{"type":"SPR","attachedEntity":true,"sheet":"fx_desperado"}],
"643": [{"type":"SPR","attachedEntity":true,"sheet":"fx_rapidshower"}],
"645": [{"type":"SPR","attachedEntity":true,"direction":true,"sheet":"fx_spread"}],
"647": [{"type":"SPR","attachedEntity":true,"sheet":"fx_tracking"}],
"648": [{"type":"SPR","attachedEntity":true,"sheet":"fx_tripleaction"}],
"ef_arrow_projectile": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":null,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"size":100,"zOffset":1,"zIndex":1,"sheet":"fx_arrow"}],
"ef_spear_projectile": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":140,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"size":100,"zOffset":1,"zIndex":1,"sheet":"fx_spear"}],
"ef_shield_projectile": [{"type":"3D","alphaMax":1,"angle":180,"attachedEntity":true,"duration":140,"fadeIn":true,"fadeOut":true,"toSrc":true,"rotateToTarget":true,"rotateWithCamera":true,"rotate":true,"nbOfRotation":1,"size":50,"zOffset":1,"zIndex":1,"images":["shield_boomerang.png"]}],
"315": [{"alphaMax":0.4,"animation":0,"attachedEntity":true,"blendMode":2,"blue":0.5,"bottomSize":0.6,"duration":50000,"fade":true,"green":0.1,"height":7,"red":0.5,"rotate":true,"topSize":0.6,"type":"CYLINDER","images":["@tex_alpha_down"]},{"alphaMax":0.4,"animation":0,"attachedEntity":true,"blendMode":2,"blue":0.5,"bottomSize":0.65,"duration":50000,"delayOffset":50,"fade":true,"green":0.1,"height":6,"red":0.5,"rotate":true,"topSize":0.65,"type":"CYLINDER","images":["@tex_alpha_down"]},{"alphaMax":0.4,"animation":0,"attachedEntity":true,"blendMode":2,"blue":0.5,"bottomSize":0.7,"duration":50000,"delayOffset":100,"fade":true,"green":0.1,"height":7,"red":0.5,"rotate":true,"topSize":0.7,"type":"CYLINDER","images":["@tex_alpha_down"]}],
"277_ground": [{"type":"tile","color":16777215,"images":["lens_w.png"],"duration":3000}],
"278_ground": [{"type":"tile","color":15572735,"images":["zz.png"],"duration":3000}],
"281_ground": [{"type":"tile","color":15558140,"images":["melody_b.png"],"duration":3000}],
"283_ground": [{"type":"tile","color":14444028,"images":["safeline.png"],"duration":3000}],
"285_ground": [{"type":"tile","color":4733951,"images":["lens_b.png"],"duration":3000}],
"ef_trap_04": [{"type":"RSM","images":["claymore-model.png"],"xyz":[4.65431,8e-05,-3.58761,4.65431,9e-05,3.59106,4.65431,3.51499,3.59106,4.65431,3.51499,3.59106,4.65431,3.51499,-3.58761,4.65431,8e-05,-3.58761,-4.63971,0.0,-3.58761,-4.65431,3.5148,-3.59999,-4.65431,3.5148,3.59999,-4.65431,3.5148,3.59999,-4.63971,0.0,3.59106,-4.63971,0.0,-3.58761,4.65431,8e-05,-3.58761,4.65431,3.51499,-3.58761,-4.65431,3.5148,-3.59999,-4.65431,3.5148,-3.59999,-4.63971,0.0,-3.58761,4.65431,8e-05,-3.58761,4.65431,3.51499,-3.58761,4.65431,3.51499,3.59106,-4.65431,3.5148,3.59999,-4.65431,3.5148,3.59999,-4.65431,3.5148,-3.59999,4.65431,3.51499,-3.58761,4.65431,3.51499,3.59106,4.65431,9e-05,3.59106,-4.63971,0.0,3.59106,-4.63971,0.0,3.59106,-4.65431,3.5148,3.59999,4.65431,3.51499,3.59106],"uv":[0.00429,0.81739,0.00438,0.20398,0.12634,0.20125,0.12634,0.20125,0.12634,0.81881,0.00429,0.81739,0.9863,0.81739,0.86677,0.81881,0.86677,0.20125,0.86677,0.20125,0.98668,0.20362,0.9863,0.81739,0.12566,0.94514,0.12634,0.81881,0.86677,0.81881,0.86677,0.81881,0.86735,0.94514,0.12566,0.94514,0.12634,0.81881,0.12634,0.20125,0.86677,0.20125,0.86677,0.20125,0.86677,0.81881,0.12634,0.81881,0.12634,0.20125,0.12576,0.0792,0.86774,0.07884,0.86774,0.07884,0.86677,0.20125,0.12634,0.20125],"duration":12000}],
"ef_trap_03_4": [{"type":"RSM","images":["sandman-model.png"],"xyz":[4.98519,0.0,5.06119,-3.30945,1.93028,3.16586,3.09031,1.93028,3.08934,4.98519,0.0,5.06119,-4.98519,0.0,5.04559,-3.30945,1.93028,3.16586,-4.98519,0.0,-4.9797,3.09023,1.98577,-3.13987,-3.38175,1.93028,-3.03701,-4.98519,0.0,-4.9797,4.97224,0.0,-5.00214,3.09023,1.98577,-3.13987,3.09023,1.98577,-3.13987,3.09031,1.93028,3.08934,-3.30945,1.93028,3.16586,3.09023,1.98577,-3.13987,-3.30945,1.93028,3.16586,-3.38175,1.93028,-3.03701,4.97203,0.0,-5.06119,3.09031,1.93028,3.08934,3.09023,1.98577,-3.13987,4.97203,0.0,-5.06119,4.98519,0.0,5.06119,3.09031,1.93028,3.08934,-4.98519,0.0,5.04559,-3.38175,1.93028,-3.03701,-3.30945,1.93028,3.16586,-4.98519,0.0,5.04559,-4.98519,0.0,-4.9797,-3.38175,1.93028,-3.03701],"uv":[0.74485,0.01029,0.33335,0.15485,0.67258,0.15485,0.74485,0.01029,0.25515,0.01029,0.33335,0.15485,0.25515,0.98971,0.67258,0.84515,0.33335,0.84515,0.25515,0.98971,0.74485,0.98971,0.67258,0.84515,0.69409,0.58787,0.69409,0.15948,0.31363,0.15481,0.69409,0.58787,0.31363,0.15481,0.30934,0.5816,0.25515,0.98971,0.67258,0.84515,0.33335,0.84515,0.25515,0.98971,0.74485,0.98971,0.67258,0.84515,0.25515,0.98971,0.67258,0.84515,0.33335,0.84515,0.25515,0.98971,0.74485,0.98971,0.67258,0.84515],"duration":12000}],
"239": [{"type":"CYLINDER","images":["ring_red.png"],"totalCircleSides":20,"topSize":3,"bottomSize":1,"height":2,"duration":10000,"fade":false,"propertyGround":true}],
"240": [{"type":"CYLINDER","images":["@tex_ring_blue"],"totalCircleSides":20,"topSize":3,"bottomSize":1,"height":2,"duration":10000,"fade":false,"propertyGround":true}],
"241": [{"type":"CYLINDER","images":["@tex_ring_yellow"],"totalCircleSides":20,"topSize":3,"bottomSize":1,"height":2,"duration":10000,"fade":false,"propertyGround":true}],
"26": [{"type":"boltRain","kind":"cold","images":["@tex_icearrow","@tex_ring_blue"]}],
"31": [{"type":"boltRain","kind":"fire","images":["@tex_firebolt1","@tex_firebolt2","@tex_firebolt3","@tex_firebolt4","@tex_firebolt5","@tex_firebolt6","@tex_ring_yellow","particle4-0.png"]}],
"27": [{"type":"ice","kind":"path","images":["@tex_ice"]}],
"28": [{"type":"ice","kind":"shards","images":["@tex_ice"]}],
"142": [{"type":"heaven","images":["stone.png"],"height":[0.75,1.2],"offsetZ":-0.1,"bottomSize":[0.4,0.7],"blendMode":1,"rotateY":[1,360],"rotateZ":[-8,8],"animation":3,"animationSpeed":250,"animationOut":true}],
"122": [{"type":"turn"}]
});
