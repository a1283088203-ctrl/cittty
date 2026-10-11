import * as T from 'three';
import {seeded} from './math';

/* Pixel-art trees: chunky cube clumps, teal shade against yellow-green light, a dusky underside
 * and thin forked trunks. Each tree (with its undergrowth) is one vertex-coloured geometry sharing a
 * single material, and wind sway runs in the vertex shader, so a tree costs one draw call. */

const unit=new T.BoxGeometry(1,1,1);
const UP=unit.getAttribute('position').array,UN=unit.getAttribute('normal').array,UI=unit.getIndex()!.array;
const color=new T.Color(),matrix=new T.Matrix4(),point=new T.Vector3(),normal=new T.Vector3(),size=new T.Vector3(),spot=new T.Vector3();
const identity=new T.Quaternion(),UPWARD=new T.Vector3(0,1,0);

const LIGHT=[0xb2d47a,0xa8cc70,0xbcd886],TEAL=[0x6aa596,0x629c90,0x72ad98],DEEP=0x6f6d88;
const TRUNK=0x8b6449,TRUNK_DARK=0x5f4535,BLOSSOM=[0xf0d27a,0xe9a7a0,0xf4ecd6];
const darker=(hex:number,f:number)=>color.setHex(hex).multiplyScalar(f).getHex();

/** Collects coloured boxes into a single indexed geometry. */
class Voxels{
 private pos:number[]=[];private nor:number[]=[];private col:number[]=[];private sway:number[]=[];private idx:number[]=[];
 /** Vertices above `pivot` sway in proportion to their height over it. */
 constructor(private pivot:number,private phase:number){}
 box(w:number,h:number,d:number,x:number,y:number,z:number,hex:number,rotation:T.Quaternion=identity){
  matrix.compose(spot.set(x,y,z),rotation,size.set(w,h,d));color.setHex(hex);
  const base=this.pos.length/3;
  for(let i=0;i<UP.length;i+=3){
   point.set(UP[i],UP[i+1],UP[i+2]).applyMatrix4(matrix);normal.set(UN[i],UN[i+1],UN[i+2]).applyQuaternion(rotation);
   this.pos.push(point.x,point.y,point.z);this.nor.push(normal.x,normal.y,normal.z);this.col.push(color.r,color.g,color.b);
   this.sway.push(Math.max(0,point.y-this.pivot));
  }
  for(let i=0;i<UI.length;i++)this.idx.push(base+UI[i]);
 }
 build(){
  const g=new T.BufferGeometry(),count=this.pos.length/3;
  g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.nor,3));
  g.setAttribute('color',new T.Float32BufferAttribute(this.col,3));g.setAttribute('sway',new T.Float32BufferAttribute(this.sway,1));
  g.setAttribute('phase',new T.Float32BufferAttribute(new Float32Array(count).fill(this.phase),1));
  g.setIndex(this.idx);g.computeBoundingBox();g.computeBoundingSphere();return g;
 }
}

const wind={windTime:{value:0},windLean:{value:.02},windDir:{value:new T.Vector2(1,0)}};
/** Shared by every tree and shrub; vertex colours carry the palette. */
export const vegetationMaterial=new T.MeshLambertMaterial({vertexColors:true});
vegetationMaterial.onBeforeCompile=shader=>{
 Object.assign(shader.uniforms,wind);
 shader.vertexShader='uniform float windTime,windLean;uniform vec2 windDir;attribute float sway;attribute float phase;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  // Lean along the wind with gusts, plus a small per-tree flutter.
  float gust=.55+.45*sin(windTime*1.4+phase);
  vec2 flutter=vec2(sin(windTime*2.1+phase),cos(windTime*2.4+phase))*sin(windTime*2.6+phase*1.7)*.014;
  transformed.xz+=(windDir*windLean*gust+flutter)*sway;`);
};
vegetationMaterial.customProgramCacheKey=()=>'vegetation-wind-v1';
export function setVegetationWind(time:number,strength:number,direction:T.Vector3){
 wind.windTime.value=time;wind.windLean.value=.02+strength*.13;wind.windDir.value.set(direction.x,direction.z);
}

/** One cube clump: main mass, dusky underside, a leafy notch on top and darker leaf specks.
 * Every clump of a tree shares one tone, so a tree reads as either a light or a dark tree. */
function clump(v:Voxels,r:()=>number,x:number,y:number,z:number,s:number,lit:boolean,simple=false){
 const hex=(lit?LIGHT:TEAL)[Math.floor(r()*3)],w=s*(.92+r()*.16),h=s*(.82+r()*.16),d=s*(.92+r()*.16);
 v.box(w,h,d,x,y,z,hex);
 v.box(w*.94,h*.16,d*.94,x,y-h*.5-h*.05,z,DEEP);
 // Distant scenery: the notch and leaf specks are too small to see through the haze, so they are skipped.
 if(simple)return;
 v.box(w*(.3+r()*.2),h*.12,d*(.3+r()*.2),x+(r()-.5)*w*.4,y+h*.55,z+(r()-.5)*d*.4,hex);
 const speck=darker(hex,lit?.84:.78);
 for(let i=0;i<3;i++){
  const face=Math.floor(r()*4),a=r()-.5,sx=face===0?w*.5:face===1?-w*.5:a*w*.7,sz=face===2?d*.5:face===3?-d*.5:a*d*.7;
  v.box(s*.12,s*.12,s*.12,x+sx,y+(r()-.35)*h*.6,z+sz,speck);
 }
}

/** Thin trunk drawn in two offset segments for a pixel-style bend, with a shaded face and root flare. */
function trunk(v:Voxels,r:()=>number,height:number,thick:number){
 const ox=(r()-.5)*.06,oz=(r()-.5)*.06;
 v.box(thick,height*.56,thick,0,height*.28,0,TRUNK);
 v.box(thick*.9,height*.5,thick*.9,ox,height*.56+height*.25,oz,TRUNK);
 v.box(thick*.32,height*.5,thick*1.02,thick*.36,height*.3,0,TRUNK_DARK);
 v.box(thick*1.8,.06,thick*1.8,0,.03,0,TRUNK_DARK);
}

/** A straight limb between two points. */
function limb(v:Voxels,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,thick:number){
 const dir=new T.Vector3(x1-x0,y1-y0,z1-z0),length=dir.length();
 v.box(thick,length,thick,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,TRUNK,new T.Quaternion().setFromUnitVectors(UPWARD,dir.normalize()));
}

/** Low shrub mounds in a single tone (light or dark), with a small cap and the odd blossom. */
function shrubs(v:Voxels,r:()=>number,count:number,spread:number,avoid:number,lit:boolean,simple=false){
 for(let i=0;i<count;i++){
  let px=0,pz=0;
  for(let tries=0;tries<6;tries++){px=(r()*2-1)*spread;pz=(r()*2-1)*spread;if(Math.hypot(px,pz)>=avoid)break;}
  const w=.26+r()*.2,h=.18+r()*.12,hex=(lit?LIGHT:TEAL)[Math.floor(r()*3)];
  v.box(w,h,w*.9,px,h/2,pz,hex);
  if(simple)continue;
  v.box(w*.62,h*.34,w*.56,px-w*.12,h+h*.1,pz+w*.1,hex);
  if(r()<.3)v.box(.06,.06,.06,px+(r()-.5)*w*.6,h*.85,pz+w*.46,BLOSSOM[Math.floor(r()*3)]);
 }
}

/** Stable per-cell tree in local space (origin at the cell centre), optionally with undergrowth.
 * `simple` drops the tiny detail boxes for far scenery (about half the triangles, same silhouette). */
export function treeGeometry(seed:number,undergrowth=0,simple=false){
 const r=seeded(seed),roll=r(),k=.86+r()*.18,form=roll<.45?0:roll<.72?1:2;
 // Two kinds of tree: light yellow-green or dark teal, never mixed within one tree.
 const lit=r()<.5;
 const height=form===2?(.7+r()*.2)*k:form===1?.24*k:.36*k;
 const v=new Voxels(height*.55,r()*Math.PI*2);
 if(form===0){
  // Broad crown: a row of three clumps under two larger ones.
  trunk(v,r,height+.3*k,.12*k);
  const y1=height+.3*k,y2=height+.76*k;
  for(const [x,z] of [[-.36,.08],[.02,-.16],[.38,.1]] as const)clump(v,r,x*k,y1,z*k,.48*k,lit,simple);
  for(const [x,z,dy] of [[-.2,-.04,0],[.22,.06,.04]] as const)clump(v,r,x*k,y2+dy*k,z*k,.56*k,lit,simple);
 }else if(form===1){
  // Tall column of stacked clumps, narrowing towards the top.
  trunk(v,r,height+.3*k,.11*k);
  const n=3+Math.floor(r()*2);
  for(let i=0;i<n;i++){const side=i%2?.07:-.07;clump(v,r,side*k,height+.3*k+i*.36*k,-side*k,(.62-i*.06)*k,lit,simple);}
 }else{
  // Branching tree: a tall thin trunk forks into two limbs carrying clumps around a top crown.
  trunk(v,r,height,.1*k);
  const fork=height*.55,angle=r()*Math.PI;
  for(const sign of [1,-1]){
   const x=Math.cos(angle)*.34*k*sign,z=Math.sin(angle)*.34*k*sign,y=height+(sign>0?.28:.12)*k;
   limb(v,0,fork,0,x,y,z,.07*k);
   clump(v,r,x,y+.16*k,z,.46*k,lit,simple);
  }
  clump(v,r,0,height+.52*k,0,.5*k,lit,simple);
 }
 if(undergrowth)shrubs(v,r,undergrowth,.55,.24,lit,simple);
 return v.build();
}

/** A free-standing shrub patch in local space; it stays still in the wind. */
export function shrubGeometry(seed:number,count:number,simple=false){
 const r=seeded(seed),v=new Voxels(99,0);shrubs(v,r,count,.5,0,r()<.5,simple);return v.build();
}
