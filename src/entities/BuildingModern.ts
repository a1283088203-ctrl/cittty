import * as T from 'three';
import type {BuildingData} from '../data/buildings';
import {box,litBox,windowBox} from '../utils/mesh';

/* Modern residences for levels 4–7: white concrete, glazing between floor slabs, balconies and planting.
 * 4 Modern Apartments · 5 Terrace Residence · 6 Glass Balcony Residence · 7 Sky Garden Residence.
 * Built from the same shared boxes and cached materials as the classic models, then batched by Building. */
export const isModern=(level:number)=>level>=4&&level<=7;

const SLAB=0xf4f2ec,PLINTH=0x5d6668,METAL=0x3f4a4f,RAIL=0xa9d0d8,RAIL_TOP=0x56646a,GLASS=0x446875,RECESS=0x55625f;
const GREEN=[0x6f9e58,0x86b366,0x5b8a4b],TRUNK=0x7b5f48,LAWN=0x8fbf6a,SOLAR=0x37557a,POT=0xb7b2a8,PLANT_ROOM=0xc9ccc8;
const ACCENTS=[0xb98a5c,0xc9785a,0x8fae9c];

/** A wall face: front/back run along x, the sides along z. */
export type Face={side:boolean;sign:number;half:number;span:number};
export const facesOf=(w:number,d:number):Face[]=>[
 {side:false,sign:1,half:d/2,span:w},{side:false,sign:-1,half:d/2,span:w},
 {side:true,sign:1,half:w/2,span:d},{side:true,sign:-1,half:w/2,span:d}];
/** A box on a face: `u` runs along it, `out` is the distance in front of the wall. */
export function onFace(g:T.Object3D,f:Face,pw:number,ph:number,depth:number,u:number,y:number,out:number,hex:number){
 const t=f.sign*(f.half+out);
 return f.side?box(g,depth,ph,pw,t,y,u,hex):box(g,pw,ph,depth,u,y,t,hex);
}
function pane(g:T.Object3D,f:Face,pw:number,ph:number,u:number,y:number){
 const t=f.sign*(f.half+.012);
 return f.side?windowBox(g,.02,ph,pw,t,y,u,GLASS,0xffc780,2.5,.6):windowBox(g,pw,ph,.02,u,y,t,GLASS,0xffc780,2.5,.6);
}
/** Glazing across a face, inset from the corners and split by white piers. */
function ribbon(g:T.Object3D,f:Face,y:number,ph:number,skip?:(u:number)=>boolean){
 const span=f.span-.3,cols=Math.max(2,Math.round(span/.52)),pw=span/cols;
 for(let c=0;c<cols;c++){
  const u=-span/2+pw*(c+.5);if(skip?.(u))continue;
  // One solid pane per bay; the mullion and transom bars were removed.
  pane(g,f,pw-.14,ph,u,y);
 }
}
/** Cantilevered balcony: slab, glass balustrade with a dark handrail, optional potted plant. */
function balcony(g:T.Object3D,f:Face,u:number,y:number,width:number,depth:number,plant:boolean){
 onFace(g,f,width,.05,depth,u,y,depth/2,SLAB);
 onFace(g,f,width,.17,.015,u,y+.11,depth-.01,RAIL);
 for(const s of [-1,1])onFace(g,f,.015,.17,depth,u+s*width/2,y+.11,depth/2,RAIL);
 onFace(g,f,width,.025,.03,u,y+.2,depth-.01,RAIL_TOP);
 if(plant){onFace(g,f,.16,.1,.1,u-width*.32,y+.075,depth*.45,POT);onFace(g,f,.18,.14,.12,u-width*.32,y+.18,depth*.45,GREEN[1]);}
}
/** A small voxel tree standing on `y`. */
function tree(g:T.Object3D,x:number,y:number,z:number,size:number,k:number){
 box(g,.06*size,.3*size,.06*size,x,y+.15*size,z,TRUNK);
 box(g,.36*size,.3*size,.34*size,x,y+.42*size,z,GREEN[k%3]);
 box(g,.22*size,.16*size,.2*size,x+.04*size,y+.64*size,z,GREEN[(k+1)%3]);
}

export function modernBuilding(g:T.Group,data:BuildingData,variant:number){
 const {width:w,depth:d,height:h,level:l}=data,F=facesOf(w,d),[front,back]=F;
 const detail=new T.Group();detail.name='facade-detail';
 const decor=new T.Group();decor.name='residential-decoration';
 const accent=ACCENTS[((variant%3)+3)%3],floors=Math.max(2,Math.floor(h/.65)),step=h/floors;
 const base=(f:number)=>-h/2+f*step,mid=(f:number)=>base(f)+step*.52,ph=step*.5,top=h/2+.18;
 // Level 7 opens every fourth storey as a planted sky garden.
 const garden=(f:number)=>l===7&&f>1&&f<floors-1&&f%4===0;

 // Structure first: body, plinth, roof slab. Tests and the placement outline rely on this child order.
 box(g,w,h,d,0,0,0,data.color);
 box(g,w+.08,.14,d+.08,0,-h/2+.07,0,PLINTH);
 box(g,w+.12,.18,d+.12,0,h/2+.09,0,data.roof);

 // White floor slabs and corner columns, with glazing between them (sky-garden floors stay open).
 for(let f=1;f<floors;f++)box(detail,w+.1,.08,d+.1,0,base(f),0,SLAB);
 for(const sx of [-1,1])for(const sz of [-1,1])box(detail,.14,h-.1,.14,sx*(w/2-.04),.02,sz*(d/2-.04),SLAB);
 F.forEach((f,fi)=>{for(let fl=1;fl<floors;fl++)if(!(garden(fl)&&fi!==1))ribbon(g,f,mid(fl),ph);});

 // Glazed lobby with a centred double door and a lit canopy.
 const lobbyH=step*.72,lobbyY=-h/2+.14+lobbyH/2,doorW=.5;
 ribbon(g,front,lobbyY,lobbyH,u=>Math.abs(u)<doorW/2+.12);
 for(const f of F.slice(1))ribbon(g,f,lobbyY,lobbyH*.8);
 onFace(g,front,doorW+.06,lobbyH+.04,.02,0,lobbyY,.014,METAL);
 for(const s of [-1,1])onFace(g,front,doorW*.44,lobbyH-.05,.01,s*doorW*.24,lobbyY-.01,.026,0x5f8c97);
 onFace(detail,front,w*.5,.05,.4,0,lobbyY+lobbyH/2+.08,.2,SLAB);
 litBox(detail,w*.44,.02,.3,0,lobbyY+lobbyH/2+.045,d/2+.2,0xf2e6c8,0xffd9a0,1.6);

 // Glass parapet around the roof edge, with dark posts along it.
 for(const s of [-1,1]){
  box(detail,w+.08,.16,.02,0,h/2+.26,s*(d/2+.05),RAIL);box(detail,w+.1,.025,.04,0,h/2+.35,s*(d/2+.05),RAIL_TOP);
  box(detail,.02,.16,d+.08,s*(w/2+.05),h/2+.26,0,RAIL);box(detail,.04,.025,d+.1,s*(w/2+.05),h/2+.35,0,RAIL_TOP);
  for(let i=1,n=Math.round(w/.5);i<n;i++)box(detail,.025,.16,.03,-w/2+w*i/n,h/2+.26,s*(d/2+.05),RAIL_TOP);
  for(let i=1,n=Math.round(d/.5);i<n;i++)box(detail,.03,.16,.025,s*(w/2+.05),h/2+.26,-d/2+d*i/n,RAIL_TOP);
 }
 // Shadow reveal under every floor slab so the storeys read as stacked plates.
 for(let f=1;f<floors;f++)box(detail,w+.06,.02,d+.06,0,base(f)-.05,0,RECESS);
 // Lobby: two tall planters standing on the ground beside the door.
 for(const s of [-1,1]){
  const u=s*(doorW/2+.17);
  onFace(decor,front,.18,.26,.16,u,-h/2+.13,.08,POT);
  onFace(decor,front,.16,.12,.14,u,-h/2+.32,.08,GREEN[s+1]);
  onFace(decor,front,.08,.08,.08,u+s*.02,-h/2+.42,.08,GREEN[1-s]);
 }

 if(l===4){
  // Modern Apartments: balconies alternating left/right on every storey, timber slats on the sides, solar roof.
  for(let fl=1;fl<floors;fl++)balcony(decor,front,(fl%2?-1:1)*w*.24,base(fl),w*.4,.26,fl%2===0);
  for(const f of [F[2],F[3]])for(let i=0;i<5;i++)onFace(detail,f,.04,h-step,.05,-d*.3+i*.08,step/2,.025,accent);
  for(let i=0;i<2;i++){const x=-w*.22+i*w*.32;box(detail,w*.24,.05,d*.3,x,top+.08,d*.12,METAL);box(detail,w*.22,.02,d*.28,x,top+.115,d*.12,SOLAR);}
  for(let i=0;i<3;i++){const x=-w*.3+i*w*.3;box(detail,.3,.1,.12,x,top+.05,-d/2+.16,POT);box(detail,.28,.1,.1,x,top+.14,-d/2+.16,GREEN[i]);}
 }else if(l===5){
  // Terrace Residence: timber fins up the front-left bay, stacked balconies on the front-right bay,
  // and a roof terrace with a set-back penthouse, timber pergola and planters.
  for(let i=0;i<4;i++)onFace(detail,front,.045,h-step,.06,-w/2+.12+i*.12,step/2,.03,accent);
  for(let fl=2;fl<floors;fl++)balcony(decor,front,w*.25,base(fl),.7,.26,fl%3===0);
  const pw=w*.56,pd=d*.56,px=-w*.14,pz=-d*.12,pH=step*.9;
  box(detail,pw,pH,pd,px,top+pH/2,pz,data.color);
  windowBox(detail,pw*.8,pH*.6,.02,px,top+pH*.5,pz+pd/2+.012,GLASS,0xffc780,2.5,.6);
  box(detail,pw+.12,.06,pd+.12,px,top+pH+.03,pz,data.roof);
  for(let i=0;i<5;i++)box(detail,.04,.04,d*.4,w*.12+i*.1,top+pH*.85,d*.12,accent);
  for(const x of [w*.12-.02,w*.12+.42])for(const z of [d*.12-d*.18,d*.12+d*.18])box(detail,.04,pH*.85,.04,x,top+pH*.425,z,accent);
  for(let i=0;i<3;i++){const x=-w*.35+i*.4;box(detail,.3,.1,.12,x,top+.05,d/2-.14,POT);box(detail,.28,.1,.1,x,top+.14,d/2-.14,GREEN[i]);}
 }else if(l===6){
  // Glass Balcony Residence: accent spandrels, then balconies that alternate sides floor by floor and wrap the corner.
  for(const f of [front,back])for(let fl=1;fl<floors;fl++)onFace(detail,f,f.span-.06,step*.16,.012,0,base(fl)+step*.13,.006,accent);
  for(let fl=2;fl<floors;fl++){
   const s=fl%2?1:-1,side=F[s>0?2:3];
   balcony(decor,front,s*w*.2,base(fl),w*.56,.3,fl%4===1);
   balcony(decor,back,-s*w*.2,base(fl),w*.56,.3,false);
   balcony(decor,side,d*.3,base(fl),d*.42,.26,false);
  }
  box(detail,w*.36,.42,d*.32,w*.18,top+.21,-d*.2,PLANT_ROOM);
  box(detail,w*.38,.04,d*.34,w*.18,top+.44,-d*.2,METAL);
  for(let i=0;i<3;i++){const x=-w*.3+i*w*.17;box(detail,w*.14,.05,d*.26,x,top+.08,d*.12,METAL);box(detail,w*.12,.02,d*.24,x,top+.115,d*.12,SOLAR);}
 }else{
  // Sky Garden Residence: white fins on the sides, planted balconies, open sky-garden storeys and a roof garden.
  for(const f of [F[2],F[3]])for(const u of [-d*.3,0,d*.3])onFace(detail,f,.04,h-step,.12,u,step/2,.06,SLAB);
  for(let fl=1;fl<floors;fl++){
   if(garden(fl)){
    for(const fi of [0,2,3]){
     const f=F[fi];
     onFace(detail,f,f.span-.06,step*.86,.01,0,base(fl)+step*.47,.004,RECESS);
     onFace(decor,f,f.span-.04,.08,.12,0,base(fl)+.04,.06,accent);
     [-.3,.05,.32].forEach((p,k)=>{
      const u=p*f.span;
      onFace(decor,f,.04,.2,.04,u,base(fl)+.18,.08,TRUNK);
      onFace(decor,f,.22,.2,.18,u,base(fl)+.38,.1,GREEN[(fl+k)%3]);
      onFace(decor,f,.14,.1,.12,u+.03,base(fl)+.52,.1,GREEN[(fl+k+1)%3]);
     });
    }
   }else if(fl>=2&&fl%2===0){
    const u=(fl%4===2?-1:1)*w*.24;
    onFace(decor,front,.66,.05,.26,u,base(fl),.13,SLAB);
    onFace(decor,front,.66,.1,.06,u,base(fl)+.075,.23,POT);
    onFace(decor,front,.66,.08,.08,u,base(fl)+.16,.22,GREEN[fl%3]);
    onFace(decor,front,.5,.12,.03,u,base(fl)-.06,.25,GREEN[2]);
   }
  }
  box(detail,w*.92,.05,d*.92,0,h/2+.205,0,LAWN);
  [[-w*.3,-d*.25],[w*.28,-d*.2],[-w*.1,d*.28]].forEach(([x,z],k)=>tree(detail,x,h/2+.23,z,1,k));
 }

 g.add(detail,decor);g.userData.variant=variant;
}
