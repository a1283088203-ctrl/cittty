/* Stroke "boil": the brush strokes are redrawn a few times a second with a small random shift, like hand-drawn
 * animation where every drawing differs slightly. Stepped (not smooth), so it reads as jitter rather than drift.
 * Shared by the paint pass and the brush-stroke depth of field so both jump on the same beat. */
export const boil={enabled:true,fps:8};
const hash=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
/** Random values in [-0.5, 0.5) for the current boil frame (all zero when boiling is off). */
export function boilFrame(){
 if(!boil.enabled)return [0,0,0,0];
 const step=Math.floor(performance.now()/1000*boil.fps);
 return [0,1,2,3].map(i=>hash(step*4+i)-.5);
}
