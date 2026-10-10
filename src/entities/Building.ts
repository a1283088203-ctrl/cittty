import {tagBuildingMaterial} from '../utils/mesh';
import {buildingDoor,doorLayout} from './BuildingDoors';
import {facadeWindow} from './BuildingWindows';
import {addPreviewOutline} from '../utils/previewOutline';
import * as T from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { buildingData, type BuildingData } from '../data/buildings';
import {batchStatic} from '../utils/batch';
import {box,litBox} from '../utils/mesh';
import {decorateResidence,randomBuildingVariant} from './BuildingDecorations';
import {refineBuilding} from './BuildingDetail';
import {modernBuilding,isModern} from './BuildingModern';
import {futureBuilding,isFuture} from './BuildingFuture';
import {addProps} from './BuildingProps';
export function buildingModel(data:BuildingData,ghost=false,era=0,variant=0){
 const g=new T.Group();
 // Levels 1–3 classic, 4–7 modern, 8–10 future.
 if(isFuture(data.level))futureBuilding(g,data,variant);else if(isModern(data.level))modernBuilding(g,data,variant);else classicModel(g,data,era,variant);
 // Small lived-in props (string lights, parasols, birds, potted plants, ivy…) on top of every style.
 addProps(g,data,variant,era);
 if(ghost)g.traverse(o=>{if(o instanceof T.Mesh){o.material=(o.material as T.Material).clone();// depthWrite: the preview writes its own depth, so the tilt-shift pass sees it at its real distance instead of
 // blurring it like the background behind it.
 Object.assign(o.material,{transparent:true,opacity:.32,depthWrite:true});o.castShadow=false;o.userData.ghost=true;}});
 if(ghost)addPreviewOutline(g,data.width,data.depth);
 return g;
}
function classicModel(g:T.Group,data:BuildingData,era:number,variant:number){
 const {width:w,depth:d,height:h,level:l}=data;
 box(g,w,h,d,0,0,0,data.color);
 box(g,w+.1,.12,d+.1,0,-h/2+.1,0,0x668177);
 // Separate the roof and body top surfaces to prevent z-fighting.
 // Keep low roof fascia flush with the stepped tiles to avoid a thin shadow seam.
 box(g,w+.12,.18,d+(l<=2?.2:.12),0,h/2+.09,0,data.roof);
 if(l<=2){const roof=new T.Group();roof.name='pitched-roof';g.add(roof);for(let i=0;i<4;i++)box(roof,w*(1-i*.2),.16,d+.2,0,h/2+.26+i*.16,0,data.roof);box(roof,.18,.48,.22,w*.27,h/2+.65,0,0x8c776c);}
 const door=doorLayout(data,variant);
 const floors=Math.max(1,Math.floor(h/.65)),cols=Math.max(2,Math.floor(w/.55));
 for(let f=0;f<floors;f++)for(let c=0;c<cols;c++){
 const y=-h/2+.5+f*(h-.65)/Math.max(1,floors-1),x=(c-(cols-1)/2)*w/(cols+1);
 const emission=0xffc780,litChance=l<=2?.3:l<=4?.45:.8;
 if(!(Math.abs(x)<door.width/2+.17&&y-.16<-h/2+door.height+.1))facadeWindow(g,x,y,d/2+.02,false,l,variant,emission,litChance);
 facadeWindow(g,w/2+.02,y,x*d/w,true,l,variant,emission,litChance);
 facadeWindow(g,x,y,-d/2-.02,false,l,variant,emission,litChance);
 facadeWindow(g,-w/2-.02,y,x*d/w,true,l,variant,emission,litChance);
 }
 buildingDoor(g,data,variant);
 if(era>=1&&l>=2&&l<=4){box(g,w*.62,.08,.4,0,-h/2+.85,d/2+.16,0xc48163);litBox(g,w*.52,.18,.04,0,-h/2+1.08,d/2+.05,0xd8bf8f,0xffce94,1.7);}
 if(l>=3)box(g,w*.35,.3,d*.35,-w*.2,h/2+.33,0,0x829591);
 if(l>=5){box(g,.12,h*.8,.12,-w/2-.1,0,d/2,0xf2ca87);box(g,w+.2,.15,d+.2,0,h*.2,0,data.roof);}
 refineBuilding(g,data,variant);
 decorateResidence(g,data,variant);
}
export class Building{
 age=0;stable=0;windAnchor=false;windReady=false;windSettleTime=0;previousVelocityY=0;impactCooldown=0;roofCovered=false;readonly data:BuildingData;readonly mesh:T.Group;readonly bounds=new T.Box3();readonly structuralBounds=new T.Box3();private roofGroup?:T.Group;private localBounds=new T.Box3();private localStructure=new T.Box3();
 constructor(public id:number,public level:number,public body:RAPIER.RigidBody,public collider:RAPIER.Collider,public era=0,public readonly variant=randomBuildingVariant()){this.data=buildingData(level);this.mesh=buildingModel(this.data,false,era,variant);batchStatic(this.mesh);const decoration=this.mesh.getObjectByName('residential-decoration') as T.Group;batchStatic(decoration);const detail=this.mesh.getObjectByName('facade-detail') as T.Group;batchStatic(detail);this.roofGroup=this.mesh.getObjectByName('pitched-roof') as T.Group|undefined;if(this.roofGroup)batchStatic(this.roofGroup);this.mesh.traverse(o=>{o.layers.enable(1);if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(tagBuildingMaterial):tagBuildingMaterial(o.material);});this.localBounds.setFromObject(this.mesh);for(const part of this.mesh.children)if(part!==decoration&&part!==detail)this.localStructure.expandByObject(part);this.sync();}
 /** Hide the pitched roof once another building rests on top, so stacked levels sit on a flat slab. */
 setRoofCovered(covered:boolean){if(covered===this.roofCovered)return;this.roofCovered=covered;if(this.roofGroup)this.roofGroup.visible=!covered;}
 sync(){this.mesh.position.copy(this.body.translation());this.mesh.quaternion.copy(this.body.rotation());this.mesh.updateMatrix();this.bounds.copy(this.localBounds).applyMatrix4(this.mesh.matrix);this.structuralBounds.copy(this.localStructure).applyMatrix4(this.mesh.matrix);}
}



