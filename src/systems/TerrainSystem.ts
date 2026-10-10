import {groundTexture,resetGroundPalette} from '../utils/groundTexture';
import * as T from 'three';
import {SurroundingTerrainSystem} from './SurroundingTerrainSystem';
import {batchStatic,disposeBatches} from '../utils/batch';
import {WaterReflection} from './WaterReflection';
import {CITY} from '../data/cityConfig';
import {box} from '../utils/mesh';
import {seeded,clamp} from '../utils/math';
import {key,toWorld,toCell,neighbors,fromKey,type Cell} from '../utils/grid';
import {mountainField,mountainCell} from '../utils/mountains';
import {vegetationMaterial,shrubGeometry} from '../utils/tree';

/** A visual voxel landscape and shared planning mask; existing ground physics stays intact. */
export class TerrainSystem{
 group=new T.Group();water=new Set<string>();blocked=new Set<string>();bridges=new Set<string>();banks=new Set<string>();rocks=new Map<string,T.Group>();hills=new Map<string,number>();
 private reflection?:WaterReflection;
 seed=0;version=0;bridgeRow=8;private ripples:T.Mesh[]=[];private rippleTime=0;
 private surroundings:SurroundingTerrainSystem;
 constructor(scene:T.Scene){scene.add(this.group);this.surroundings=new SurroundingTerrainSystem(scene);}
 generate(seed=Math.floor(Math.random()*0xffffffff)){
  resetGroundPalette();
  this.reflection?.dispose();this.seed=seed;this.version++;disposeBatches(this.group);this.group.clear();this.water.clear();this.blocked.clear();this.bridges.clear();this.banks.clear();this.rocks.clear();this.hills.clear();this.ripples=[];this.rippleTime=0;
  const random=seeded(seed);let x=5+Math.floor(random()*5);this.bridgeRow=6+Math.floor(random()*4);
  for(let z=0;z<CITY.size;z++){
   const previous=x;if(z%2===0)x=clamp(x+Math.floor(random()*3)-1,4,10);
   for(let col=Math.min(previous,x);col<=Math.max(previous,x)+1;col++)this.water.add(key({x:col,z}));
  }
  for(const k of this.water){this.blocked.add(k);const p=fromKey(k);if(p.z===this.bridgeRow)this.bridges.add(k);for(const n of neighbors(p))if(!this.water.has(key(n)))this.banks.add(key(n));}
  // Foothills of the map's mountain range step into the city on its side; they block building like rocks.
  // Water and banks stay low so the river cuts through, and the main road row keeps an open pass.
  const field=mountainField(seed,toWorld({x:0,z:this.bridgeRow}).z),peaks=seeded(seed^0x6e2f05);
  // Build-area trees and shrubs (shared wind material); flagged so batching and regeneration free their buffers.
  const plant=(geometry:T.BufferGeometry,px:number,py:number,pz:number)=>{const m=new T.Mesh(geometry,vegetationMaterial);m.position.set(px,py,pz);m.castShadow=true;m.receiveShadow=true;m.userData.batchedGeometry=true;this.group.add(m);};
  for(let cx=0;cx<16;cx++)for(let z=0;z<16;z++){
   const p={x:cx,z},k=key(p),w=toWorld(p);
   if(this.water.has(k)||this.banks.has(k)||z===this.bridgeRow)continue;
   const top=Math.round(field.height(w.x,w.z)*2)/2;
   if(top<.5)continue;
   this.hills.set(k,top);this.blocked.add(k);
   // Same column builder as the outer range, starting at the ground slab's bottom (-0.34).
   mountainCell((bw,bh,bd,bx,by,bz,c)=>box(this.group,bw,bh,bd,bx,by,bz,c),plant,w.x,w.z,-.34,top,field.crest,peaks);
  }
  for(let cx=0;cx<16;cx++)for(let z=0;z<16;z++){
   const p={x:cx,z},k=key(p),w=toWorld(p);
   if(this.hills.has(k))continue;
   if(this.water.has(k)){
    box(this.group,1.5,.12,1.5,w.x,-.22,w.z,[0x5aa2ad,0x67b4bc,0x6aadb4][Math.floor(random()*3)]);
    if(random()<.65){const ripple=box(this.group,.4+random()*.4,.014,.035,w.x,-.151,w.z,0xa4d9d5);ripple.castShadow=false;this.ripples.push(ripple);}
   }else{
    const bank=this.banks.has(k),dirt=random()<.16;
    groundTexture(box(this.group,1.5,.34,1.5,w.x,-.17,w.z,bank?0xccbe91:dirt?0xb9ad82:[0x96ba8a,0xa0c496,0x92b58c][Math.floor(random()*3)]),bank||dirt?'dirt':'grass');
    // Riverbank: fluffy grass mounds along the water's edge soften the bank (same random draw as the old reeds).
    if(bank&&random()<.55){const s=(seed^Math.imul(cx+1,73856093)^Math.imul(z+1,19349663))>>>0;plant(shrubGeometry(s,2),w.x+.42,0,w.z+.4);plant(shrubGeometry(s^0x9e3779b9,1),w.x+.3,0,w.z-.38);}
    if(cx>1&&cx<14&&z!==this.bridgeRow&&random()<.023){this.blocked.add(k);const rock=new T.Group();box(rock,.7,.4,.6,w.x,.2,w.z,0x8d9c85);box(rock,.44,.25,.4,w.x+.1,.48,w.z-.04,0xa9b29a);this.group.add(rock);this.rocks.set(k,rock);}
   }
  }
  this.surroundings.generate(seed,this.water,field);this.ripples.push(...this.surroundings.outerRipples);
  const animated=new Set(this.ripples);for(const rock of this.rocks.values())rock.traverse(o=>{if(o instanceof T.Mesh)animated.add(o);});batchStatic(this.group,m=>animated.has(m));this.reflection=new WaterReflection(this.water,this.bridges,this.surroundings.waterTiles);this.group.add(this.reflection.surface);
 }
 /** Rock lookup for the demolition missile: cell key plus blast center. */
 rockAt(x:number,z:number){
  for(const k of this.rocks.keys()){const p=toWorld(fromKey(k));if(Math.abs(p.x-x)<=.75&&Math.abs(p.z-z)<=.75)return {cell:k,position:new T.Vector3(p.x,.4,p.z)};}
  return null;
 }
 /** Rocks share the global box geometry/materials, so removal is unlink-only. */
 removeRock(cell:string){const rock=this.rocks.get(cell);if(!rock)return;rock.removeFromParent();this.rocks.delete(cell);this.blocked.delete(cell);}
 canPlace(x:number,z:number,width:number,depth:number,yaw=0){
  const w=Math.abs(Math.cos(yaw))*width+Math.abs(Math.sin(yaw))*depth,d=Math.abs(Math.sin(yaw))*width+Math.abs(Math.cos(yaw))*depth;
  const minX=x-w/2-.06,maxX=x+w/2+.06,minZ=z-d/2-.06,maxZ=z+d/2+.06;
  if(minX< -CITY.half||maxX>CITY.half||minZ< -CITY.half||maxZ>CITY.half)return false;
  for(const k of this.blocked){const p=toWorld(fromKey(k));if(p.x+.75>minX&&p.x-.75<maxX&&p.z+.75>minZ&&p.z-.75<maxZ)return false;}
  return true;
 }
 findPlot(width:number,depth:number,occupied:{x:number;z:number}[]=[]):Cell|null{
  const random=seeded(this.seed+occupied.length*713);const candidates:Cell[]=[];
  for(let x=2;x<14;x++)for(let z=2;z<14;z++){const p=toWorld({x,z});if(z!==this.bridgeRow&&this.canPlace(p.x,p.z,width,depth)&&occupied.every(o=>Math.hypot(o.x-p.x,o.z-p.z)>3.2))candidates.push(p);}
  return candidates.length?candidates[Math.floor(random()*candidates.length)]:null;
 }
 update(dt:number,maxLevel=1){this.surroundings.update(dt,maxLevel);this.rippleTime+=dt;this.reflection?.update(this.rippleTime);for(let i=0;i<this.ripples.length;i++)this.ripples[i].scale.x=(.5+Math.sin(this.rippleTime*1.4+i)*.12);}
}
