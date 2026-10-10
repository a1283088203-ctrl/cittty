import * as T from 'three';
import {seeded} from '../utils/math';

/* Foreground pixel clouds for the fully zoomed-out view. They drift in from the left and right edges into the empty
 * bands above and below the city (big at the screen edges, smaller towards the middle, which stays clear) and slide
 * back out, fading, as soon as the player zooms in. Plain DOM canvases between the game canvas and the HUD, moved
 * only with transform/opacity.
 * Shape: tall billowy domes over a long, thin skirt that tapers in pixel steps, with crisp two-tone sphere shading so
 * overlapping puffs show inner outlines. Colours are derived from the live fog each frame, so the clouds are white by
 * day, take the warm sky tint at sunrise/sunset and turn a blended blue-grey at night. */

const EMPTY=255;
// Light from the upper left and slightly in front (canvas y points down).
const LIGHT=(()=>{const v=[-.5,-.8,.35],l=Math.hypot(v[0],v[1],v[2]);return v.map(x=>x/l);})();
const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

type Puff={x:number;y:number;r:number};
/** Tone map for one cloud: 0 = shadow, 1 = mid, 2 = highlight, EMPTY = transparent. */
type Shape={tones:Uint8Array;w:number;h:number};

export function cloudShape(seed:number,W:number):Shape{
 const r=seeded(seed),H=Math.max(16,Math.round(W*.36)),base=H-2,tones=new Uint8Array(W*H).fill(EMPTY);
 const set=(x:number,y:number,t:number)=>{if(x>=0&&x<W&&y>=0&&y<=base)tones[y*W+x]=t;};
 const cc=W*(.46+(r()-.5)*.12),hw=W*(.2+r()*.05);

 // Skirt: a thin flat band across the whole width, thicker under the domes, tapering to the tips in pixel steps.
 const thick=Math.max(2,Math.round(H*.09));let tip=W;
 for(let x=0;x<W;x++){
  const edge=Math.min(x,W-1-x)/(W*.5),under=Math.max(0,1-Math.abs(x-cc)/(W*.36));
  const th=Math.min(thick+2,Math.floor(edge*thick*2.6+.4)+Math.round(thick*.7*under));
  if(th>0&&x<tip)tip=x;
  for(let k=0;k<th;k++)set(x,base-k,k===th-1&&th>1?2:1);
 }
 // A detached fleck just past each tip, like wisps breaking off.
 for(const x0 of [tip-4,W-1-tip+2])for(let k=0;k<2;k++)set(x0+k,base,1);

 // Puffs, drawn back to front so the front ones overlap the shaded undersides of those behind (inner outlines).
 const paint=(p:Puff)=>{
  for(let y=Math.max(0,Math.floor(p.y-p.r));y<=Math.min(base,Math.ceil(p.y+p.r));y++)for(let x=Math.max(0,Math.floor(p.x-p.r));x<Math.min(W,Math.ceil(p.x+p.r));x++){
   const nx=(x+.5-p.x)/p.r,ny=(y+.5-p.y)/p.r,d2=nx*nx+ny*ny;if(d2>1)continue;
   const lambert=nx*LIGHT[0]+ny*LIGHT[1]+Math.sqrt(1-d2)*LIGHT[2];
   set(x,y,lambert>.32?2:lambert>-.12?1:0);
  }
 };
 const main:Puff={x:cc+(r()-.5)*W*.05,y:base-H*.4,r:H*.4};
 paint({x:main.x-hw*.62,y:base-H*.25,r:H*(.27+r()*.04)});
 paint({x:main.x+hw*.66,y:base-H*.2,r:H*(.24+r()*.04)});
 paint(main);
 for(let i=0,n=2+Math.floor(r()*2);i<n;i++){
  const a=Math.PI*(.25+(i+r())/n*.5);
  paint({x:main.x+Math.cos(a)*main.r*.62,y:main.y-Math.sin(a)*main.r*.5,r:H*(.13+r()*.06)});
 }
 // Low shoulders spread the cluster into the skirt, smaller towards the ends.
 for(let i=0;i<5;i++){
  const t=i/4*2-1,rad=H*(.13+r()*.08)*(1-.35*Math.abs(t));
  paint({x:cc+t*hw*1.55+(r()-.5)*hw*.15,y:base-rad*.5,r:rad});
 }
 for(let i=0;i<2;i++){const rad=H*(.19+r()*.05);paint({x:main.x+(i?hw*.35:-hw*.3)+(r()-.5)*hw*.2,y:base-rad*.62,r:rad});}

 // Shade the underside of the cluster: no highlights on the last two rows, deepest tone on the base row.
 for(let x=0;x<W;x++){if(Math.abs(x-cc)>hw*1.35)continue;
  for(const y of [base-1,base]){const i=y*W+x;if(tones[i]===EMPTY)continue;tones[i]=y===base?0:Math.min(tones[i],1);}
 }
 return {tones,w:W,h:H};
}

type Slot={fx:number;fy:number;s:number;delay:number;side:-1|1};
// Clouds stay outside a central rhombus (|u|+|v| ≳ 1.2 with u,v running -1..1 across the screen), so the middle is
// clear in a diamond shape and the clouds gather in the four corners: the biggest right at the corner, smaller ones
// stepping along the top/bottom edge and down/up the side edge towards the rhombus. Layout for the top-left corner:
const CORNER=[
 {fx:.03,fy:.05,s:1,delay:0},{fx:.26,fy:.02,s:.58,delay:.18},{fx:.02,fy:.25,s:.6,delay:.12},{fx:.17,fy:.13,s:.36,delay:.3}];
// Per-corner nudges (dx, dy, size factor) so the four corners are not exact mirror copies.
const NUDGE=[[0,0,1],[.012,.015,.93],[-.01,-.012,1.06],[.008,.01,.97]];
export const SLOTS:Slot[]=([[-1,-1],[1,-1],[-1,1],[1,1]] as const).flatMap(([sx,sy],k)=>CORNER.map((c,i)=>{
 const [dx,dy,f]=NUDGE[(k+i)%4],fx=c.fx+dx,fy=c.fy+dy;
 return {fx:sx<0?fx:1-fx,fy:sy<0?fy:1-fy,s:c.s*f,delay:c.delay+k*.03,side:sx};
}));

type Cloud={slot:Slot;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;shape:Shape;image:ImageData;
 restX:number;restY:number;away:number;phase:number;speed:number};

/** Each tone (shadow, mid, highlight) is the live fog colour lifted towards a light colour by `lift` (0 = fog, 1 = light).
 * Day, sunrise/sunset and night each have their own light colour and lift curve; the game blends between them. */
type CloudPhase={light:string;lift:[number,number,number]};
type CloudPalette={day:CloudPhase;dusk:CloudPhase;night:CloudPhase;opacity:number};
/** Final values tuned with the (now removed) colour panel. */
const defaultCloudPalette=():CloudPalette=>({
 day:{light:'#ffffff',lift:[.76,.91,.96]},
 dusk:{light:'#ffae00',lift:[.6,.68,.64]},
 night:{light:'#9ba5b0',lift:[.43,.5,.5]},
 opacity:.7});

export class ForegroundClouds{
 private readonly root=document.createElement('div');private readonly clouds:Cloud[]=[];
 private readonly seed=Math.floor(Math.random()*1e9);private readonly still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 private t=0;private time=0;private px=2;private visible=true;private paletteKey='';private lastPaint=-1;
 private readonly lift=new T.Color();private readonly duskLight=new T.Color();private readonly nightLight=new T.Color();
 private readonly tones=[new T.Color(),new T.Color(),new T.Color()];private rgb:number[][]=[[0,0,0],[0,0,0],[0,0,0]];
 private readonly palette=defaultCloudPalette();
 constructor(parent:HTMLElement){
  this.root.className='foreground-clouds';this.root.setAttribute('aria-hidden','true');
  Object.assign(this.root.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden'});
  SLOTS.forEach((slot,i)=>{
   const canvas=document.createElement('canvas');
   // Smooth upscale plus a light blur turns the hard tone map into soft painted cloud masses.
   Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',imageRendering:'auto',filter:'blur(1.5px)',willChange:'transform,opacity',opacity:'0'});
   this.root.append(canvas);
   this.clouds.push({slot,canvas,ctx:canvas.getContext('2d')!,shape:{tones:new Uint8Array(0),w:0,h:0},image:new ImageData(1,1),
    restX:0,restY:0,away:0,phase:i*1.7,speed:.3+(i%4)*.06});
  });
  parent.append(this.root);this.resize(innerWidth,innerHeight);this.setVisible(false);
 }
 /** Rebuilds the cloud textures for a game viewport of w×h CSS pixels; pixel size stays the same for every cloud. */
 resize(w:number,h:number){
  this.px=Math.max(2,Math.min(4,Math.round(Math.min(w,h)/330)));
  // Portrait phones have tall empty bands and a narrow width, so their clouds are relatively wider.
  const baseW=(w<h?w*1.04:w*.6)/this.px;
  this.clouds.forEach((c,i)=>{
   c.shape=cloudShape(this.seed+i*7919,Math.max(40,Math.round(baseW*c.slot.s)));
   c.canvas.width=c.shape.w;c.canvas.height=c.shape.h;c.image=c.ctx.createImageData(c.shape.w,c.shape.h);
   // Inline !important: the global `#app canvas{width:100%!important}` rule (meant for the game canvas) would stretch these.
   const cw=c.shape.w*this.px,ch=c.shape.h*this.px;c.canvas.style.setProperty('width',`${cw}px`,'important');c.canvas.style.setProperty('height',`${ch}px`,'important');
   c.restX=w*c.slot.fx-cw/2;c.restY=h*c.slot.fy-ch/2;
   c.away=c.slot.side<0?-(c.restX+cw+32):w-c.restX+32;
  });
  this.paletteKey='';
 }
 private setVisible(on:boolean){if(on===this.visible)return;this.visible=on;this.root.style.visibility=on?'visible':'hidden';}
 private repaint(){
  for(const c of this.clouds){
   const {tones}=c.shape,data=c.image.data;
   for(let i=0;i<tones.length;i++){const t=tones[i],o=i*4;if(t===EMPTY){data[o+3]=0;continue;}const p=this.rgb[t];data[o]=p[0];data[o+1]=p[1];data[o+2]=p[2];data[o+3]=255;}
   c.ctx.putImageData(c.image,0,0);
  }
 }
 private updateColors(fog:T.Color,night:number,sunset:number){
  const p=this.palette;
  this.lift.set(p.day.light).lerp(this.duskLight.set(p.dusk.light),sunset).lerp(this.nightLight.set(p.night.light),night);
  for(let t=0;t<3;t++){
   const amount=T.MathUtils.lerp(T.MathUtils.lerp(p.day.lift[t],p.dusk.lift[t],sunset),p.night.lift[t],night);
   const hex=this.tones[t].copy(fog).lerp(this.lift,amount).getHex();this.rgb[t]=[(hex>>16)&255,(hex>>8)&255,hex&255];
  }
  const key=this.rgb.join(';');
  // The palette drifts slowly with the day cycle; repaint at most a few times per second.
  if(key!==this.paletteKey&&(this.paletteKey===''||this.time-this.lastPaint>.15)){this.paletteKey=key;this.lastPaint=this.time;this.repaint();}
 }
 /** `distance`/`maxDistance` come from the orbit camera; clouds are fully in only at (nearly) maximum zoom-out. */
 update(dt:number,distance:number,maxDistance:number,fog:T.Color,night=0,sunset=0){
  this.time+=dt;
  const target=smooth(maxDistance*.8,maxDistance*.97,distance);
  this.t+=(target-this.t)*(1-Math.exp(-Math.max(0,dt)*3.5));
  if(this.t<.003){this.setVisible(false);return;}
  this.setVisible(true);this.updateColors(fog,night,sunset);
  const px=this.px;
  for(const c of this.clouds){
   const k=Math.min(1,Math.max(0,(this.t-c.slot.delay)/(1-c.slot.delay))),e=k*k*(3-2*k);
   const bob=this.still?0:1,x=c.restX+(1-e)*c.away+Math.sin(this.time*c.speed+c.phase)*px*4*bob;
   const y=c.restY+Math.sin(this.time*c.speed*.7+c.phase*1.3)*px*1.5*bob;
   c.canvas.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
   c.canvas.style.opacity=(e*this.palette.opacity).toFixed(3);
  }
 }
}
