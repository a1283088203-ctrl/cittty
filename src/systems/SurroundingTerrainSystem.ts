import {groundTexture,configureGroundTexture} from '../utils/groundTexture';
import * as T from 'three';
import {box} from '../utils/mesh';
import {batchStatic,disposeBatches} from '../utils/batch';
import {seeded,clamp} from '../utils/math';
import {fromKey,toWorld} from '../utils/grid';
import {mountainCell,type MountainField} from '../utils/mountains';
import {vegetationMaterial} from '../utils/tree';

/** The build area's tree material plus the scenery distance fog and alpha tag, so far trees fade with the ground
 * instead of floating in the haze. Wind sway still comes from the shared vegetation hook. */
let sceneryVegetationMaterial:T.MeshLambertMaterial|undefined;
function sceneryVegetation(){
 if(sceneryVegetationMaterial)return sceneryVegetationMaterial;
 const material=new T.MeshLambertMaterial({vertexColors:true}),wind=vegetationMaterial.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{wind.call(vegetationMaterial,shader,renderer);
  shader.vertexShader='varying vec2 sceneryXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsceneryXZ=(modelMatrix*vec4(position,1.0)).xz;');
  shader.fragmentShader='varying vec2 sceneryXZ;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=.75;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n#ifdef USE_FOG\n{float sceneryFog=smoothstep(17.0,43.0,length(sceneryXZ));gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,sceneryFog);}\n#endif');
 };
 material.customProgramCacheKey=()=>'scenery-vegetation-v1';
 return sceneryVegetationMaterial=material;
}

/** Visual scenery only: never added to physics or the buildable grid. */
export class SurroundingTerrainSystem{
 readonly group=new T.Group();readonly waterTiles:[number,number][]=[];outerRipples:T.Mesh[]=[];
 private materials:T.Material[]=[];
 private decay={value:0};private drying=false;
 private colors:{material:T.MeshLambertMaterial;green:T.Color;dry:T.Color}[]=[];
 constructor(scene:T.Scene){this.group.name='surrounding-terrain';scene.add(this.group);}
 generate(seed:number,river:Set<string>,field:MountainField){
  disposeBatches(this.group);this.group.clear();this.materials.forEach(m=>m.dispose());this.materials=[];this.waterTiles.length=0;this.outerRipples=[];
  this.decay.value=0;this.drying=false;this.colors=[];
  const random=seeded(seed^0x51af37),phase=random()*Math.PI*2;
  const ends=[0,15].map(row=>{const cells=[...river].map(fromKey).filter(p=>p.z===row);return cells.reduce((n,p)=>n+toWorld(p).x,0)/Math.max(1,cells.length);});
  const channels=new Map<number,number>();
  for(const side of [-1,1]){let x=ends[side<0?0:1];for(let row=0;row<12;row++){channels.set(side*(13.5+row*3),x);x=clamp(x+(random()-.5)*2.4,-15,15);}}
  // Scenery casts and receives the sun's (blue-grey) shadows like the city, so the background has light and shade too.
  const add=(w:number,h:number,d:number,x:number,y:number,z:number,color:number)=>box(this.group,w,h,d,x,y,z,color);
  const leaf=(w:number,h:number,d:number,x:number,y:number,z:number,color:number)=>{
   const m=add(w,h,d,x,y,z,color);m.geometry=m.geometry.clone();m.userData.batchedGeometry=true;
   const count=m.geometry.attributes.position.count,centers=new Float32Array(count*3),delays=new Float32Array(count),delay=random()*.45;
   for(let i=0;i<count;i++){centers.set([x,y,z],i*3);delays[i]=delay;}
   m.geometry.setAttribute('leafCenter',new T.BufferAttribute(centers,3));m.geometry.setAttribute('leafDelay',new T.BufferAttribute(delays,1));
  };
  // Build-area trees and shrubs on the mountains; they keep the shared wind material (skipped by the fog clone below).
  const plant=(geometry:T.BufferGeometry,px:number,py:number,pz:number)=>{const m=new T.Mesh(geometry,sceneryVegetation());m.position.set(px,py,pz);m.castShadow=true;m.receiveShadow=true;m.userData.batchedGeometry=true;this.group.add(m);};
  // The mountain range shared with TerrainSystem climbs on out here to snowy peaks. It has its own random stream
  // so the rivers stay the same for a seed.
  const peaks=seeded(seed^0x7d3a11),crest=field.crest;
  const mountain=(x:number,z:number,channel?:number)=>{
   let m=field.height(x,z);
   // Rivers cut a valley through the range instead of being buried.
   if(channel!==undefined)m*=clamp((Math.abs(x-channel)-4.8)/7,0,1);
   return Math.round((m+(peaks()-.5)*.6)*2)/2;
  };
  for(let ix=-16;ix<16;ix++)for(let iz=-16;iz<16;iz++){
   const x=ix*3+1.5,z=iz*3+1.5;if(Math.abs(x)<12&&Math.abs(z)<12)continue;
   const distance=Math.max(Math.abs(x),Math.abs(z))-12;
   const channel=channels.get(z),water=channel!==undefined&&Math.abs(x-channel)<2.3,bank=channel!==undefined&&Math.abs(x-channel)<4.8;
   const hills=(Math.sin(x*.17+phase)+Math.cos(z*.13-phase)+2)*.35;
   const lowland=water?-.16:bank?0:Math.floor(hills*clamp((distance-3)/12,0,1)*4)/4;
   // Water keeps its sunken top (-0.16) so the river reflection plane (-0.154) stays visible above it.
   const peak=water||bank?0:mountain(x,z,channel),top=water?lowland:Math.max(lowland,peak);
   const grass=[0x96ba8a,0xa0c496,0x92b58c][Math.floor(random()*3)];
   if(peak>=.5){
    // Mountains use the build area's 1.5-unit cells and its ground texture, so the range reads at the same
    // pixel grain as the city and its tops blend meadow -> rock -> snow like the grass/soil edges inside.
    const corners=[[-.75,-.75],[.75,-.75],[-.75,.75],[.75,.75]].map(([ox,oz])=>({ox,oz,h:Math.max(lowland,mountain(x+ox,z+oz,channel))}));
    const hs=corners.map(c=>c.h),hi=Math.max(...hs),lo=Math.min(...hs);
    // Big blocks: where the slope is gentle, the four cells of this tile merge into one 3x3 block,
    // so the range mixes large slabs with the standard cells and the small split blocks.
    if(hi-lo<=1&&hi<crest*.78&&peaks()<.35)mountainCell(add,plant,x,z,-2,Math.round(hs.reduce((s,h)=>s+h,0)/2)/2,crest,peaks,3);
    else for(const c of corners)mountainCell(add,plant,x+c.ox,z+c.oz,-2,c.h,crest,peaks);
    continue;
   }
   const color=water?0x67adb5:bank?0xccbe91:grass;
   const tile=add(3,2+top,3,x,top/2-1,z,color);
   if(water)this.waterTiles.push([x,z]);
   if(!water)groundTexture(tile,bank?'dirt':'grass');
   if(!water&&!bank&&distance>3&&distance<25&&random()<.09){
    const px=x+(random()-.5),pz=z+(random()-.5);
    if(random()<.4){add(.7,.4,.6,px,top+.2,pz,0x8d9c85);}
    else{const h=.8+random()*.9;add(.18,h,.18,px,top+h/2,pz,0x786c48);leaf(1.1,.7,.9,px,top+h,pz,0x64865e);leaf(.65,.4,.65,px+.12,top+h+.45,pz,0x78986a);}
   }
  }
  // Random ripple strips scattered over the outer waterways, matching the inner river's style.
  for(const [wx,wz] of this.waterTiles){
   if(random()<.85){const n=1+Math.floor(random()*3);
    for(let i=0;i<n;i++){
     const r=box(this.group,.4+random()*.5,.014,.035,wx+(random()-.5)*2.1,-.151,wz+(random()-.5)*2.1,0xa4d9d5);
     r.castShadow=false;this.outerRipples.push(r);
    }
   }
  }
  const still=new Set(this.outerRipples);batchStatic(this.group,m=>still.has(m));
  // Fade only scenery with world distance, so zooming out never hides the playable city.
  this.group.traverse(o=>{if(!(o instanceof T.Mesh)||o.material===sceneryVegetation())return;const material=(o.material as T.MeshLambertMaterial).clone();const foliage=!!o.geometry.getAttribute('leafCenter');
   // A lone unbatched leaf still uses local positions; bake it just like the batches.
   if(foliage&&(o.position.lengthSq()>0||o.scale.x!==1)){o.updateMatrix();o.geometry.applyMatrix4(o.matrix);o.position.set(0,0,0);o.scale.set(1,1,1);}
   if([0x96ba8a,0xa0c496,0x92b58c,0x64865e,0x78986a].includes(material.color.getHex()))this.colors.push({material,green:material.color.clone(),dry:new T.Color(foliage?0xaa945b:0xc5b074)});
   configureGroundTexture(material);const groundHook=material.onBeforeCompile;
   material.onBeforeCompile=(shader,renderer)=>{groundHook.call(material,shader,renderer);
   shader.vertexShader='varying vec2 sceneryXZ;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsceneryXZ=(modelMatrix*vec4(position,1.0)).xz;');
   if(foliage){shader.uniforms.sceneryDecay=this.decay;shader.vertexShader='uniform float sceneryDecay;attribute vec3 leafCenter;attribute float leafDelay;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=leafCenter+(transformed-leafCenter)*(1.0-smoothstep(leafDelay,leafDelay+.55,sceneryDecay));');}
   shader.fragmentShader='varying vec2 sceneryXZ;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=.75;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n#ifdef USE_FOG\n{float sceneryFog=smoothstep(17.0,43.0,length(sceneryXZ));gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,sceneryFog);}\n#endif');
  };material.customProgramCacheKey=()=> 'scenery-distance-fog-v3-'+foliage+'-'+(material.userData.groundKind??'plain');o.material=material;this.materials.push(material);});
 }
 update(dt:number,maxLevel:number){
  if(maxLevel>=9)this.drying=true;
  if(!this.drying||this.decay.value>=1)return;
  this.decay.value=Math.min(1,this.decay.value+Math.max(0,dt)/45);
  const t=T.MathUtils.smoothstep(this.decay.value,0,1);
  for(const c of this.colors)c.material.color.copy(c.green).lerp(c.dry,t);
 }
}
