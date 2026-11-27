// The classic pre-renewal EF_LEVEL99, EF_LEVEL99_2 and EF_LEVEL99_3 share one origin at the feet.
const images = [
  new URL('./level-aura/ground.png', import.meta.url).href,
  new URL('../assets/fxtex/tex_ring_blue.png', import.meta.url).href,
  new URL('./level-aura/spark.png', import.meta.url).href
];
const radians = Math.PI / 180;
const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
const squareUV = [0,1, 1,1, 1,0, 0,0];
function quads(count) {
  const uv = [], index = [];
  for (let i=0;i<count;i++) {
    const n=i*4; uv.push(...squareUV); index.push(n,n+1,n+2,n,n+2,n+3);
  }
  return {uv,index};
}
function bands() {
  const uv=[],index=[];
  for(let band=0;band<3;band++) {
    for(let k=0;k<=20;k++) {
      uv.push(k/20,1,k/20,0);
      const n=band*42+k*2;
      if(k<20) index.push(n,n+1,n+2,n+1,n+3,n+2);
    }
  }
  return {uv,index};
}
function makeAura(renderer,textures) {
  const layer=(shape,texture,tint,opacity)=>renderer.levelAuraLayer(shape.uv,shape.index,texture,tint,opacity);
  const ground=layer(quads(2),textures[0],0xffffff,.8);
  const swirl=layer(bands(),textures[1],0x6464ff,120/255);
  const sparkle=layer(quads(16),textures[2],0x5050ff,.9);
  const pieces=[ground,swirl,sparkle];
  const unit=renderer.unit;
  let ticks=0;
  return {
    pieces,
    draw(game,seconds) {
      const {player,world3d}=game;
      const up=world3d.perspective.matrixWorld.elements;
      const groundHeight=world3d.heightAt(player.x,player.y);
      ticks+=seconds/.025;
      for(const piece of pieces) {
        piece.mesh.visible=game.level>=99&&!player.dead;
        piece.mesh.position.set(player.x,groundHeight+.6,player.y);
      }
      if(!ground.mesh.visible)return;
      const pulse=(1-Math.cos(ticks*3*radians))/2;
      for(let i=0;i<2;i++) {
        const angle=i*23*radians, c=Math.cos(angle), s=Math.sin(angle);
        const half=((i?130:115)+(i?-15:15)*pulse)*unit/70;
        for(let k=0;k<4;k++) {
          const [x,z]=corners[k],dx=half*(x*c-z*s),dz=half*(x*s+z*c);
          const lift=world3d.heightAt(player.x+dx,player.y+dz)-groundHeight;
          ground.position.setXYZ(i*4+k,dx,lift,dz);
        }
      }
      const growth=Math.sin(Math.min(90,ticks)*radians);
      for(let i=0;i<3;i++) {
        const tilt=(55-5*i)*radians, base=(3.9+.2*i)*.22*.6*unit;
        for(let k=0;k<=20;k++) {
          const angle=(i*90+ticks*(3+i)+315*k/20)*radians;
          const c=Math.cos(angle),s=Math.sin(angle);
          const height=(15-2*i)*.22*unit*Math.sin(k*Math.PI/20)*growth;
          const top=base+height*Math.cos(tilt),n=42*i+2*k;
          swirl.position.setXYZ(n,base*c,0,base*s);
          swirl.position.setXYZ(n+1,top*c,height*Math.sin(tilt),top*s);
        }
      }
      // The original bubble texture spends most of its cycle below the floor.
      // Fixed starting phases keep drawing independent from combat's seeded RNG.
      for(let i=0;i<16;i++) {
        const height=((ticks*.15+i*8.17)%129)-99;
        const drift=Math.max(0,height)*.22*unit;
        const angle=i*2.4+ticks*.026;
        const x=drift*.48*Math.cos(angle), z=drift*.48*Math.sin(angle);
        const size=height>0?2.4*.22*.6*unit*Math.min(1,(30-height)/7):0;
        for(let k=0;k<4;k++) {
          const [across,above]=corners[k];
          sparkle.position.setXYZ(i*4+k,x+size*(up[0]*across+up[4]*above),
            height*.22*unit+size*(up[1]*across+up[5]*above),z+size*(up[2]*across+up[6]*above));
        }
      }
      for(const piece of pieces)piece.position.needsUpdate=true;
    }
  };
}
export function syncRunLevelAura(game,seconds,renderer=globalThis.ROClassicProcRenderer){
  let state=game.runLevelAura;
  if(!state){
    if(game.level<99||!renderer||!game.player||!game.world3d?.scene)return;
    state=game.runLevelAura={effect:null,loading:false,retryAfter:0};
    game.cleanup.push(()=>{
      game.runLevelAura=null;
      for(const piece of state.effect?.pieces??[]) {
        game.world3d.scene.remove(piece.mesh);piece.mesh.geometry.dispose();piece.mesh.material.dispose();
      }
    });
  }
  if(state.effect){state.effect.draw(game,seconds);return}
  if(game.level<99||state.loading||performance.now()<state.retryAfter)return;
  state.loading=true;
  Promise.all(images.map(url=>renderer.load(url))).then(textures=>{
    if(game.runLevelAura!==state)return;
    state.effect=makeAura(renderer,textures);
    state.effect.draw(game,0);
    for(const piece of state.effect.pieces)game.world3d.scene.add(piece.mesh);
  }).catch(()=>{
    state.retryAfter=performance.now()+5000;
  }).finally(()=>{state.loading=false});
}
