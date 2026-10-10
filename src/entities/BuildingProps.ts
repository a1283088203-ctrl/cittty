import * as T from 'three';
import type {BuildingData} from '../data/buildings';
import {box,litBox} from '../utils/mesh';
import {seeded} from '../utils/math';
import {doorLayout} from './BuildingDoors';
import {facesOf,onFace,isModern,type Face} from './BuildingModern';
import {isFuture} from './BuildingFuture';

/* Small "lived-in" props layered on top of every building style. Design rules:
 * - Environmental storytelling: props imply the people inside (a café table, string lights, potted plants, birds).
 * - Grounding: anything standing in front of a building sits on a terrace joined to that building's plinth.
 * - Detail hierarchy: props cluster at eye level (ground floor) and on the roofline silhouette; mid-facades stay calm
 *   so the building still reads as one shape from the zoomed-out camera.
 * - Shape language: rounded, soft props (parasols, plants, lanterns) for homes; cleaner vertical props for later eras.
 * - Era progression: cosy clutter on cottages, tidy utility on modern blocks, a few calm props on future towers.
 * - Variety: each variant gets a different prop set, so neighbouring buildings of one level differ.
 * Colours reuse the existing palette (roof terracotta, cream, sage/teal, timber, planting greens, warm lamp light).
 * Everything goes into the existing decoration / pitched-roof groups, so it is batched and never affects collision. */

const CREAM=0xf3e6c8,WIRE=0x3f4a4f,BIRD=0x4d5a63,BEAK=0xe0a050,WOOD=0x806850,POT=0xa77860,WHITE=0xf4f2ec,GRILLE=0x8d9294;
const TEAL=0x648b88,SOLAR=0x37557a,BLOOM=0xf2d27a,LEAF=[0x6f9e58,0x86b366,0x5b8a4b];
// Same colour as the modern plinth in BuildingModern, so terraces read as part of it.
const MODERN_PLINTH=0x5d6668;
const LAMP=0xffdc98,LAMP_GLOW=0xffd38b;

function litOnFace(g:T.Object3D,f:Face,pw:number,ph:number,depth:number,u:number,y:number,out:number){
 const t=f.sign*(f.half+out);
 return f.side?litBox(g,depth,ph,pw,t,y,u,LAMP,LAMP_GLOW,2.2):litBox(g,pw,ph,depth,u,y,t,LAMP,LAMP_GLOW,2.2);
}
/** Small warm lanterns under the eaves, following a gentle sag; they glow with the night lights. The dark wire and
 * hangers were dropped: from the game camera they only read as a stray black line across the facade. */
function lanterns(g:T.Object3D,f:Face,u0:number,u1:number,y:number,count:number,out=.05,sag=.07){
 const span=u1-u0,at=(t:number)=>y-sag*Math.sin(Math.PI*t);
 for(let i=0;i<count;i++){const t=(i+.5)/count,u=u0+span*t;litOnFace(g,f,.06,.07,.06,u,at(t)-.07,out);}
}
/** Striped fabric awning stepping out and down from the wall, with a little scalloped valance. */
function awning(g:T.Object3D,f:Face,u:number,y:number,width:number,depth:number,a:number,b:number){
 const n=Math.max(3,Math.round(width/.09)),sw=width/n;
 for(let row=0;row<3;row++)for(let i=0;i<n;i++)onFace(g,f,sw,.05,depth/3+.01,u-width/2+sw*(i+.5),y-row*.045,depth*(row+.5)/3,i%2?a:b);
 for(let i=0;i<n;i++)onFace(g,f,sw*.75,.05,.02,u-width/2+sw*(i+.5),y-.16,depth,i%2?a:b);
}
/** Café parasol over a little table with two stools; the stacked canopy reads as a soft dome. */
function parasol(g:T.Object3D,x:number,y0:number,z:number,a:number,b:number,size=1){
 box(g,.28,.03,.28,x,y0+.27,z,WOOD);box(g,.04,.25,.04,x,y0+.13,z,WOOD);
 for(const s of [-1,1])box(g,.1,.12,.1,x+s*.22,y0+.06,z,WOOD);
 box(g,.025,.62,.025,x,y0+.52,z,WIRE);
 box(g,.56*size,.05,.56*size,x,y0+.8,z,a);box(g,.42*size,.05,.42*size,x,y0+.85,z,b);box(g,.22*size,.04,.22*size,x,y0+.89,z,a);
}
/** A small perched bird; `dir` turns it to face +x or -x. */
function bird(g:T.Object3D,x:number,y:number,z:number,dir=1){
 box(g,.09,.05,.05,x,y+.025,z,BIRD);box(g,.045,.045,.045,x+dir*.05,y+.065,z,BIRD);
 box(g,.022,.012,.012,x+dir*.083,y+.06,z,BEAK);box(g,.04,.02,.03,x-dir*.06,y+.035,z,BIRD);
}
/** Wall-mounted air conditioner with a grille and a bracket underneath. */
function airCon(g:T.Object3D,f:Face,u:number,y:number){
 onFace(g,f,.28,.19,.12,u,y,.06,WHITE);onFace(g,f,.15,.13,.01,u-.045,y,.125,GRILLE);
 onFace(g,f,.04,.03,.01,u+.09,y+.05,.125,GRILLE);onFace(g,f,.3,.02,.14,u,y-.105,.07,WIRE);
}
/** Paving slab running from the front wall out under a ground prop, in the plinth's colour and height, so the prop
 * stands on the building's own base and never hangs in the air (e.g. when the house sits on a stack or a bank). */
function terrace(g:T.Object3D,x:number,width:number,front:number,reach:number,y0:number,height:number,hex:number){
 box(g,width,height,reach,x,y0+height/2,front+reach/2-.02,hex);
}
/** Ivy climbing one corner of a face, thinning out as it rises, with a few small flowers. */
function ivy(g:T.Object3D,f:Face,edge:number,y0:number,height:number,seed:number){
 const r=seeded(seed);
 for(let i=0;i<14;i++){const t=r(),s=.1+r()*.1;onFace(g,f,s,s*.9,.035,edge*(f.span/2-.06-r()*((1-t)*.36+.06)),y0+.1+t*height,.02,LEAF[Math.floor(r()*3)]);}
 for(let i=0;i<4;i++)onFace(g,f,.045,.045,.02,edge*(f.span/2-.08-r()*.22),y0+.2+r()*height*.7,.045,BLOOM);
}
/** Terracotta pot with a leafy plant. */
function pot(g:T.Object3D,x:number,y0:number,z:number,k:number){
 box(g,.16,.14,.16,x,y0+.07,z,POT);box(g,.2,.16,.2,x,y0+.22,z,LEAF[k%3]);box(g,.1,.1,.1,x+.03,y0+.33,z,LEAF[(k+1)%3]);
}
/** Greenery trailing down over a roof edge. */
function trailing(g:T.Object3D,f:Face,u:number,y:number,len:number){
 for(let i=0;i<len;i++)onFace(g,f,.18-i*.025,.09,.04,u+(i%2?.02:-.02),y-i*.08,.07,LEAF[i%3]);
}
/** Vertical-axis micro wind turbine. */
function turbine(g:T.Object3D,x:number,y:number,z:number){
 box(g,.05,.5,.05,x,y+.25,z,WHITE);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3,blade=box(g,.03,.32,.08,x+Math.cos(a)*.11,y+.42,z+Math.sin(a)*.11,WHITE);blade.rotation.y=-a;}
 box(g,.26,.02,.26,x,y+.59,z,WHITE);
}
/** Tilted solar panel in a white frame. */
function solarSail(g:T.Object3D,x:number,y:number,z:number){
 box(g,.04,.18,.04,x,y+.09,z,WHITE);
 const frame=box(g,.52,.03,.38,x,y+.2,z,WHITE);frame.rotation.x=-.4;
 const cells=box(g,.46,.012,.32,x,y+.218,z+.006,SOLAR);cells.rotation.x=-.4;
}

export function addProps(g:T.Group,data:BuildingData,variant:number,era:number){
 const decor=g.getObjectByName('residential-decoration') as T.Group|undefined;if(!decor)return;
 const roof=g.getObjectByName('pitched-roof') as T.Group|undefined;
 const {width:w,depth:d,height:h,level:l}=data,F=facesOf(w,d),front=F[0],v=((variant%3)+3)%3,y0=-h/2;
 const seed=l*7919+v*104729;

 if(isFuture(l)){
  // Future towers stay calm: only a few clean silhouette props on the roof.
  const top=h/2+.18;
  if(v===0){
   bird(decor,w*.18,h/2+.32,d/2+.05,1);bird(decor,w*.26,h/2+.32,d/2+.05,-1);
   trailing(decor,front,-w*.36,h/2+.12,5);trailing(decor,F[1],w*.3,h/2+.12,4);
  }else if(v===1){for(const s of [-1,1])turbine(decor,s*w*.44,top+.04,0);}
  else for(const s of [-1,1])solarSail(decor,s*w*.44,top+.04,0);
  return;
 }

 if(isModern(l)){
  const floors=Math.max(2,Math.floor(h/.65)),step=h/floors,base=(f:number)=>-h/2+f*step,top=h/2+.18;
  if(v===0){
   // Planting spilling over the parapet, birds on the rail.
   trailing(decor,front,-w*.36,h/2+.12,5);trailing(decor,F[1],w*.3,h/2+.12,4);
   bird(decor,w*.12,h/2+.355,d/2+.05,1);bird(decor,w*.2,h/2+.355,d/2+.05,-1);
  }else if(v===1){
   // Street life at the lobby once the town has grown, otherwise a pair of large pots; both on terraces joined to
   // the modern plinth (dark grey, 0.14 tall).
   for(const s of [-1,1]){
    if(era>=1){terrace(decor,s*(w/2-.3),.66,d/2,.6,y0,.14,MODERN_PLINTH);parasol(decor,s*(w/2-.3),y0+.14,d/2+.3,s<0?TEAL:CREAM,s<0?CREAM:TEAL,.9);}
    else{terrace(decor,s*(w/2-.25),.34,d/2,.36,y0,.14,MODERN_PLINTH);pot(decor,s*(w/2-.25),y0+.14,d/2+.18,s+1);}
   }
  }else{
   // Air conditioners stacked up one side wall (clear of each tier's fins and slats).
   const side=F[2],u=l===4?d*.22:-d*.22;
   for(let fl=1;fl<floors;fl+=2)airCon(decor,side,u,base(fl)+.13);
  }
  return;
 }

 // Classic cottages and town apartments: the most lived-in props, at the door and on the roof.
 // Terraces match the classic stone plinth (BuildingDetail: building colour × 0.55, 0.1 tall).
 const door=doorLayout(data,variant),stone=new T.Color(data.color).multiplyScalar(.55).getHex();
 // Pitched roofs: top of the ridge cap; flat roofs: top of the coping parapet (both from BuildingDetail).
 const roofTop=roof?h/2+.86:h/2+.24,perch=roof??decor;
 if(v===0){
  // Already has flower boxes: birds on the ridge.
  // Pitched roofs: birds on the ridge. Flat roofs carry rooftop boxes in the middle, so birds sit on the front edge.
  if(roof){bird(perch,-w*.06,roofTop,0,1);if(l>1)bird(perch,w*.08,roofTop,0,-1);}
  else{bird(decor,w*.1,roofTop,d/2+.03,1);bird(decor,w*.18,roofTop,d/2+.03,-1);}
 }else if(v===1){
  // Already has a striped canopy: warm string lights under the eaves, and a café parasol on the smallest cottage.
  lanterns(decor,front,-w/2+.12,w/2-.12,h/2-.07,l===1?4:5);
  if(l===1&&era>=1){terrace(decor,w/2-.22,.64,d/2,.58,y0,.1,stone);parasol(decor,w/2-.22,y0+.1,d/2+.32,data.roof,CREAM);}
  else if(l>1)awning(decor,F[2],0,y0+.72,Math.min(.5,d*.3),.24,data.roof,CREAM);
 }else{
  // A potted plant by the door, on a small terrace joined to the stone plinth.
  const x=door.width/2+.38;
  terrace(decor,x,.32,d/2,.36,y0,.1,stone);pot(decor,x,y0+.1,d/2+.17,l);
 }
}
