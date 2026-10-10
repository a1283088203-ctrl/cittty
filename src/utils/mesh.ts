import * as T from 'three';
const geometry=new T.BoxGeometry(1,1,1);
const materials=new Map<number,T.MeshLambertMaterial>();
const buildingMaterials=new Map<T.MeshLambertMaterial,T.MeshLambertMaterial>();
const TAG_BUILDINGS=false;
/** Reserve opaque building alpha as a boundary-strength tag; no extra geometry pass. */
export function tagBuildingMaterial(source:T.Material){
 // The outline pass that read these alpha tags is gone (painted look), so tagging is off; call sites stay as they are.
 if(!TAG_BUILDINGS||!(source instanceof T.MeshLambertMaterial))return source;
 let tagged=buildingMaterials.get(source);
 if(!tagged){const alpha=source.userData.windowLight?'0.25':'0.5';tagged=source.clone();tagged.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n gl_FragColor.a = '+alpha+';');};tagged.customProgramCacheKey=()=> 'building-boundary-tag-'+alpha;buildingMaterials.set(source,tagged);}
 return tagged;
}
const glowing=new Map<string,{material:T.MeshLambertMaterial;intensity:number}>();
type WindowLight={material:T.MeshLambertMaterial;intensity:number;brightness:number;target:number;remaining:number;litChance:number};
const windows=new Map<string,WindowLight>();
const windowGroups=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches?8:32;
const randomBrightness=(litChance:number)=>Math.random()>litChance?0:Math.random()<.22?1.4+Math.random()*.4:.35+Math.random()*.55;
let nightAmount=0;
export function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number){
 let material=materials.get(color);if(!material){material=new T.MeshLambertMaterial({color});materials.set(color,material);}
 const mesh=new T.Mesh(geometry,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
/** Shared emissive materials, no per-window lights or textures. */
export function litBox(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number,emission:number,intensity=2){
 const mesh=box(parent,w,h,d,x,y,z,color),id=`${color}:${emission}:${intensity}`;
 let entry=glowing.get(id);if(!entry){const material=new T.MeshLambertMaterial({color,emissive:emission,emissiveIntensity:intensity*nightAmount});entry={material,intensity};glowing.set(id,entry);}
 mesh.material=entry.material;return mesh;
}
/** Randomly assigned, bounded material groups keep windows inexpensive on phones. */
export function windowBox(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number,emission:number,intensity=2,litChance=.65){
 const mesh=box(parent,w,h,d,x,y,z,color),id=`${emission}:${intensity}:${litChance}:${Math.floor(Math.random()*windowGroups)}`;
 let entry=windows.get(id);
 if(!entry){const brightness=randomBrightness(litChance);entry={material:new T.MeshLambertMaterial({color,emissive:emission,emissiveIntensity:intensity*nightAmount*brightness}),intensity,brightness,target:brightness,remaining:3+Math.random()*15,litChance};windows.set(id,entry);}
 entry.material.userData.windowLight=true;mesh.material=entry.material;mesh.userData.windowLight=true;mesh.castShadow=false;return mesh;
}
export function setNightLights(amount:number,dt=0){
 nightAmount=amount;for(const entry of glowing.values())entry.material.emissiveIntensity=amount*entry.intensity;
 for(const entry of windows.values()){
  if(amount>.01){entry.remaining-=dt;if(entry.remaining<=0){entry.target=randomBrightness(entry.litChance);entry.remaining=6+Math.random()*14;}
   entry.brightness+=(entry.target-entry.brightness)*(1-Math.exp(-Math.max(0,dt)/1.8));}
  entry.material.emissiveIntensity=amount*entry.intensity*entry.brightness;
 }
 for(const [source,tagged] of buildingMaterials)tagged.emissiveIntensity=source.emissiveIntensity;
}
export function disposeTree(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh && o.userData.owned){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.removeFromParent();}

