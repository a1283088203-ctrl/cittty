import * as T from 'three';
import {CITY} from '../data/cityConfig';
import {seeded,clamp} from './math';
import {groundTexture} from './groundTexture';
import {treeGeometry,shrubGeometry} from './tree';

// Build-area palette (TerrainSystem): grass tiles, the soil tile and the two rock blocks.
const GRASS=[0x96ba8a,0xa0c496,0x92b58c],DIRT=0xb9ad82,ROCK=0x8d9c85,ROCK_TOP=0xa9b29a,SNOW=0xf2f1ea;

/**
 * One random mountain range per map: on the west, the north, or both (behind the city from the default camera).
 * The same height field drives the stepped foothills inside the playable grid and the snowy range in the scenery
 * ring, so the two join up at the city edge. `passZ` keeps the main road row open through a pass in the west range.
 */
export function mountainField(seed:number,passZ:number){
 const r=seeded(seed^0x2c1b9e),range=Math.floor(r()*3),ph1=r()*Math.PI*2,ph2=r()*Math.PI*2,ph3=r()*Math.PI*2;
 const crest=8+r()*4;
 const ridge=(p:number)=>crest+4.5*(Math.sin(p*.21+ph1)*.55+Math.sin(p*.47+ph2)*.3+Math.cos(p*.09+ph2)*.15);
 // How far the foothills reach into the city (world units), varying along the edge.
 const reach=(p:number)=>4.5+1.2*Math.sin(p*.33+ph3);
 const side=(t:number,p:number)=>T.MathUtils.smoothstep(t+reach(p),0,14)*ridge(p);
 const height=(x:number,z:number)=>{
  let west=range!==1?side(-x-CITY.half,z):0;
  // The pass is fully open inside the city and closes again further out.
  const pass=clamp((Math.abs(z-passZ)-1)/3,0,1),open=clamp((-x-CITY.half)/8,0,1);
  west*=pass+(1-pass)*open;
  return Math.max(west,range!==0?side(-z-CITY.half,x):0);
 };
 return {range,crest,height};
}
export type MountainField=ReturnType<typeof mountainField>;

type Add=(w:number,h:number,d:number,x:number,y:number,z:number,color:number)=>T.Mesh;
/** Places a build-area vegetation geometry (local space, origin at its base) at a world position. */
export type Plant=(geometry:T.BufferGeometry,x:number,y:number,z:number)=>void;

/**
 * One 1.5-unit mountain column, built only from the build area's own pieces: its grass and soil tiles and
 * ground texture, its trees and shrubs (utils/tree) and its two-block rocks. Low cells are plain grass tiles;
 * taller ones are a soil-coloured cliff with a grass tile on top, a few left as bare soil so the tops blend
 * grass <-> soil exactly like the city ground. The highest cells keep a snow cap.
 */
export function mountainCell(add:Add,plant:Plant,x:number,z:number,bottom:number,top:number,crest:number,r:()=>number,size=1.5){
 const snow=top>=crest*.78,low=top<.6;
 // Mixed block sizes: some standard cells break up into four small blocks of uneven height (recursion stops there).
 if(size===1.5&&!snow&&top>=1&&r()<.3){
  const steps=[-.5,-.25,0,.25,.5];
  for(const ox of [-.375,.375])for(const oz of [-.375,.375])
   mountainCell(add,plant,x+ox,z+oz,bottom,Math.max(.5,top+steps[Math.floor(r()*5)]),crest,r,.75);
  return;
 }
 const small=size<1.5,bare=!snow&&!low&&r()<.2,half=size/2;
 const grass=()=>GRASS[Math.floor(r()*3)];
 // The whole column, sides included, is a grass tile; bare cells get a thin soil slab on top instead.
 const body=add(size,top-bottom,size,x,(top+bottom)/2,z,grass());
 groundTexture(body,'grass');
 if(bare){const soil=add(size,.06,size,x,top+.02,z,DIRT);groundTexture(soil,'dirt');}
 if(snow){
  // Overhanging snow slab with a few drips down the sides.
  const cap=add(size+.04,.14,size+.04,x,top-.05,z,SNOW);groundTexture(cap,'dirt');
  // One drip per cell (was three): the snow drips alone were ~65k triangles across the range.
  for(let i=0,n=Math.max(1,Math.round(size*.7));i<n;i++){const a=Math.floor(r()*4),u=(r()-.5)*size*.73,len=.15+r()*.3,o=half+.02;
   // Drips are too thin to throw a visible shadow; leaving them out of the shadow pass saves thousands of triangles.
   const drip=a<2?add(.18,len,.04,x+u,top-.12-len/2,z+(a?o:-o),SNOW):add(.04,len,.18,x+(a===2?o:-o),top-.12-len/2,z+u,SNOW);drip.castShadow=false;}
  return;
 }
 // A smaller block stacked off-centre on some big tops, so slopes read as heaps of blocks rather than one grid.
 let lump=false;
 if(!small&&!bare&&r()<.25){
  const s=size*(.38+r()*.2),lh=.25+r()*.3,room=(size-s)/2,lx=x+(r()*2-1)*room,lz=z+(r()*2-1)*room;
  const block=add(s,lh,s,lx,top+lh/2,lz,grass());groundTexture(block,'grass');lump=true;
  if(r()<.5)plant(shrubGeometry(Math.floor(r()*0x7fffffff),1,true),lx,top+lh,lz);
 }
 // Soft painted edges: grass mounds overhang the block's rim and hide the hard step corner.
 for(let i=0,n=small?(r()<.5?1:0):Math.round(size*.7+r()*1.2);i<n;i++){const a=Math.floor(r()*4),u=(r()-.5)*size*.73,o=half*.88;
  plant(shrubGeometry(Math.floor(r()*0x7fffffff),small?1:2,true),x+(a<2?u:a===2?o:-o),top-.06,z+(a<2?(a?o:-o):u));}
 // Big blocks carry more than one feature; small blocks only get shrubs or a rock.
 for(let i=0,n=size>2?2:lump?0:1;i<n;i++){
  const ground=top+(bare?.05:0),k=r(),px=x+(r()-.5)*size*.33,pz=z+(r()-.5)*size*.33,seed=Math.floor(r()*0x7fffffff);
  if(bare){if(k<.5)rock(add,px,ground,pz);continue;}
  // Scenery vegetation uses the simplified geometry: same shapes, without the specks too small to see from the city.
  if(k<.38&&!small)plant(treeGeometry(seed,k<.19?1+Math.floor(r()*3):0,true),px,ground,pz);
  else if(k<.54)plant(shrubGeometry(seed,small?1:2+Math.floor(r()*3),true),px,ground,pz);
  else if(k<.64&&!small)rock(add,px,ground,pz);
 }
}
/** The build area's rock: two stacked blocks. */
function rock(add:Add,x:number,y:number,z:number){
 add(.7,.4,.6,x,y+.2,z,ROCK);add(.44,.25,.4,x+.1,y+.48,z-.04,ROCK_TOP);
}
