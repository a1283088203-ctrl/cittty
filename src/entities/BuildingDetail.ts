import * as T from 'three';
import type {BuildingData} from '../data/buildings';
import {box,litBox} from '../utils/mesh';
import {doorLayout} from './BuildingDoors';

/** Derived shades stay coherent with each building's palette; shared hexes keep materials cached. */
const shade=(hex:number,f:number)=>new T.Color(hex).multiplyScalar(f).getHex();
const tint=(hex:number,f:number)=>new T.Color(hex).lerp(new T.Color(0xffffff),f).getHex();

/**
 * Fine facade/roof detailing, kept out of the structural body:
 * the group is excluded from structuralBounds (roads, merges) like decorations.
 * Everything uses shared box geometry + cached materials and is batchStatic'd later.
 */
export function refineBuilding(parent:T.Group,data:BuildingData,variant:number){
 const g=new T.Group();g.name='facade-detail';parent.add(g);
 const {width:w,depth:d,height:h,level:l}=data,front=d/2,side=w/2;
 const trim=shade(data.color,.72),sill=tint(data.color,.28),stone=shade(data.color,.55);
 const floors=Math.max(1,Math.floor(h/.65)),cols=Math.max(2,Math.floor(w/.55));
 const step=(h-.65)/Math.max(1,floors-1),rowY=(f:number)=>-h/2+.5+f*step;
 const door=doorLayout(data,variant);

 // Two-tier base plinth grounding the body.
 box(g,w+.24,.1,d+.24,0,-h/2+.05,0,stone);

 // Entrance: steps, lintel and lamps.
 box(g,door.width+.5,.07,.3,0,-h/2+.035,front+.15,stone);
 box(g,door.width+.34,.07,.18,0,-h/2+.105,front+.09,shade(data.color,.65));
 box(g,door.width+.2,.08,.06,0,-h/2+door.height+.055,front+.045,tint(data.color,.3));
 if(l<=2)litBox(g,.06,.1,.06,0,-h/2+door.height+.12,front+.05,0x8a7a5c,0xffc780,1.5);
 else for(const s of [-1,1])litBox(g,.06,.1,.06,s*(door.width/2+.14),-h/2+door.height+.1,front+.05,0x8a7a5c,0xffc780,1.5);

 // Continuous sill ledges under every window row (front row 0 skipped: the door lives there).
 for(let f=0;f<floors;f++){
  const y=rowY(f)-.19;
  if(f>0)box(g,w*.82,.045,.07,0,y,front+.035,sill);
  box(g,w*.82,.045,.07,0,y,-front-.035,sill);
  box(g,.07,.045,d*.82,side+.035,y,0,sill);
  box(g,.07,.045,d*.82,-side-.035,y,0,sill);
 }

 // Window heads: a lintel over every window (top rows that meet the eaves are left plain), keystones on the apartment.
 const head=tint(data.color,.3),key=shade(data.color,.82),xAt=(c:number)=>(c-(cols-1)/2)*w/(cols+1);
 for(let f=0;f<floors;f++){
  const y=rowY(f)+.2;if(y+.03>h/2-.02)continue;
  for(let c=0;c<cols;c++){
   const x=xAt(c),u=x*d/w;
   if(!(Math.abs(x)<door.width/2+.17&&rowY(f)-.16<-h/2+door.height+.1)){box(g,.34,.05,.05,x,y,front+.025,head);if(l===3)box(g,.07,.07,.06,x,y,front+.03,key);}
   box(g,.34,.05,.05,x,y,-front-.025,head);
   box(g,.05,.05,.34,side+.025,y,u,head);box(g,.05,.05,.34,-side-.025,y,u,head);
  }
 }
 // Drainpipe down the back-right corner.
 box(g,.05,h-.16,.05,side+.03,-.02,-front+.1,0x8b9a94);
 box(g,.1,.08,.1,side+.04,h/2-.1,-front+.1,0x7d8c88);
 box(g,.1,.04,.12,side+.04,-h/2+.12,-front+.1,0x7d8c88);
 // Eave brackets and the dark tile-course lines under each roof step were removed: the eaves read as clean shapes.
 const roof=parent.getObjectByName('pitched-roof');
 if(roof){
  // Ridge cap and a capped chimney.
  const tile=shade(data.roof,.78);
  box(roof,w*.4+.06,.04,d+.2,0,h/2+.84,0,tile);
  box(roof,.24,.05,.28,w*.27,h/2+.915,0,shade(0x8c776c,.8));
  box(roof,.08,.06,.08,w*.27,h/2+.97,0,0x4f4640);
 }else for(const s of [-1,1]){
  // Flat roof: a low coping parapet on the slab edge.
  box(g,w+.12,.06,.06,0,h/2+.21,s*(d/2+.03),trim);box(g,.06,.06,d,s*(w/2+.03),h/2+.21,0,trim);
 }

 if(l<=2){
  // Houses: window shutters on the front.
  for(let f=0;f<floors;f++)for(let c=0;c<cols;c++){
   const y=rowY(f),x=(c-(cols-1)/2)*w/(cols+1);
   if(Math.abs(x)<door.width/2+.17&&y-.16<-h/2+door.height+.1)continue;
   box(g,.055,.3,.03,x-.19,y,front+.02,data.roof);
   box(g,.055,.3,.03,x+.19,y,front+.02,data.roof);
  }
 }else{
  // Flat roofs: water tank, vent pipes, antenna.
  box(g,.4,.3,.4,w*.28,h/2+.33,-d*.25,0x9aa8a4);
  box(g,.44,.06,.44,w*.28,h/2+.5,-d*.25,0x7d8c88);
  box(g,.07,.34,.07,w*.05,h/2+.32,d*.3,0x8b9a94);
  box(g,.11,.04,.11,w*.05,h/2+.5,d*.3,0x6d7a74);
  if(l<=4){
   box(g,.05,.7,.05,-w*.38,h/2+.53,-d*.32,0x7d8c88);
   box(g,.09,.09,.09,-w*.38,h/2+.9,-d*.32,0x9aa8a4);
  }
 }

 if(l>=3&&l<=4){
  // Balconies on the front, AC units on the back.
  for(let f=1;f<floors;f+=2){
   const bx=(f%4<2?-1:1)*w*.22,y=rowY(f);
   box(g,.66,.07,.24,bx,y-.34,front+.12,trim);
   box(g,.66,.05,.035,bx,y-.12,front+.22,shade(data.color,.5));
   for(const s of [-1,1])box(g,.04,.2,.04,bx+s*.29,y-.22,front+.22,shade(data.color,.5));
  }
  box(g,.24,.2,.16,-w*.28,rowY(1)-.3,-front-.08,0xa9b3ac);
  box(g,.2,.14,.02,-w*.28,rowY(1)-.3,-front-.17,0x6d7a74);
 }
 // Levels 4+ are built by BuildingModern / BuildingFuture, so the classic detail stops at the low-rise tiers.
}
