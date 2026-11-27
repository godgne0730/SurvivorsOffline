import {silhouette} from './video-magic.js';

const stances=new Set(['tornado_kick','heel_drop','roundhouse','counter_kick']);

// This precedes the kick in the archived client, while the body is in its ready ACT.
export function prepareKick(weapon) {
  if(!stances.has(weapon.id))return;
  const update=weapon.update;
  let previousCast=-1;
  weapon.update=function(dt,game) {
    if(game && this.casts!==previousCast && this.timer<=.46 && !game.runItems?.deityLevel?.(this.id) &&
      game.fxRoom?.() && game.player.pose && !game.player.dead && !game.player.sitting){
      const target=game.nearestEnemy(140);
      if(target){
        previousCast=this.casts;
        const player=game.player;
        const dx=target.x-player.x,dy=target.y-player.y;
        if(dx||dy){player.facingX=dx;player.facingY=dy;}
        player.pose('ready');
        silhouette(game,player,460,0xc65aff);
      }
    }
    return update.call(this,dt,game);
  };
}

const activeFalls=new WeakMap();
export function topple(game,enemy) {
  const body=enemy.sprite,R=globalThis.ROClassicProcRenderer;
  if(!body||!R||body.destroyed||!game.fxRoom()||activeFalls.has(body))return;
  const view=R.container(),rest=body.rotation??0,sign=enemy.x<game.player.x?-1:1;
  activeFalls.set(body,view);
  const restore=()=>{
    if(activeFalls.get(body)!==view)return;
    activeFalls.delete(body);if(!body.destroyed)body.rotation=rest;
  };
  view.once('destroyed',restore);
  let elapsed=0;
  game.addFx({view,anchor:enemy,pcVisible:true,update(ms){
    elapsed+=ms;
    if(enemy.dead||body.destroyed||elapsed>=560){restore();return true;}
    const tilt=Math.min(1,elapsed/100,(560-elapsed)/130);
    body.rotation=rest+sign*Math.PI*.5*tilt;
    return false;
  }});
}
