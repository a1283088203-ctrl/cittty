import * as T from 'three';
import {windowBox} from '../utils/mesh';

type Pane=readonly [number,number,number,number]; // width, height, horizontal offset, vertical offset
// Each style is now one solid pane (no glazing bars): the outer size of the old split layouts is kept, so the
// windows still vary in shape from building to building.
const STYLES:readonly Pane[]=[
 [.24,.26,0,0],
 [.24,.28,0,0],
 [.24,.275,0,0],
 [.17,.32,0,0],
 [.26,.275,0,0],
 [.24,.295,0,.0025]
];

/** Six window shapes, each a single undivided pane. */
export function facadeWindow(parent:T.Group,x:number,y:number,z:number,side:boolean,level:number,variant:number,emission:number,litChance:number){
 const style=(level<=3?0:3)+((variant%3)+3)%3,[width,height,dx,dy]=STYLES[style];
 const pane=windowBox(parent,1,1,1,0,0,0,0x446875,emission,level<3?1.7:2.5,litChance);
 pane.scale.set(side?.025:width,height,side?width:.025);
 pane.position.set(x+(side?0:dx),y+dy,z+(side?dx:0));
}
