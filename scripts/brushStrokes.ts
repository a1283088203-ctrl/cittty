// Generates public/textures/brush-strokes.png: a seamless field of overlapping flat-brush strokes used as the
// smear mask of the depth-of-field blur.
// Channels: RG stroke direction (x,y)*0.5+0.5, B bristle streaks along the stroke, A stroke coverage (soft edges,
// tapered body, dry-brush ragged tail).
// Run: bun scripts/brushStrokes.ts
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';

const S=512,COUNT=280,BASE=-.35;
const seeded=(seed:number)=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const r=seeded(7);
const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
/** 1D value noise from a table, for bristles across the brush and the ragged tail. */
const noise1=(table:number[],x:number)=>{const n=table.length,i=Math.floor(x),f=x-i,a=table[((i%n)+n)%n],b=table[(((i+1)%n)+n)%n],s=f*f*(3-2*f);return a+(b-a)*s;};

const rgba=new Float32Array(S*S*4);
for(let i=0;i<S*S;i++){rgba[i*4]=.5;rgba[i*4+1]=.5;}
for(let k=0;k<COUNT;k++){
 // Strokes share a loose painting direction so the field never flips sign (d and -d would cancel when blended).
 const angle=BASE+(r()+r()+r()-1.5)*.7,dx=Math.cos(angle),dy=Math.sin(angle);
 const L=50+r()*100,W=9+r()*16,cx=r()*S,cy=r()*S;
 const bristles=Array.from({length:48},()=>r()),tail=Array.from({length:48},()=>r());
 const reach=Math.ceil(L/2+W);
 for(let y=-reach;y<=reach;y++)for(let x=-reach;x<=reach;x++){
  const u=x*dx+y*dy,v=-x*dy+y*dx,t=u/L+.5;if(t<0||t>1)continue;
  // Flat brush: full width through the body, rounded where it touches down, thinning as the paint runs out.
  const width=W*Math.sqrt(Math.min(1,t*6))*(1-.35*t*t);
  const across=smooth(width,width*.7,Math.abs(v));if(across<=0)continue;
  const bristle=noise1(bristles,(v/W+1)*12);
  // Dry-brush tail: individual bristles run out at different points.
  const end=.72+.24*noise1(tail,(v/W+1)*9);
  const along=smooth(0,.06,t)*(1-smooth(end-.08,end,t))*(bristle>.25||t<.5?1:.4);
  const m=across*along;if(m<=0)continue;
  const px=((Math.round(cx+x)%S)+S)%S,py=((Math.round(cy+y)%S)+S)%S,i=(py*S+px)*4;
  rgba[i]+=(dx*.5+.5-rgba[i])*m;rgba[i+1]+=(dy*.5+.5-rgba[i+1])*m;rgba[i+2]+=(bristle-rgba[i+2])*m;rgba[i+3]=Math.max(rgba[i+3],m);
 }
}
const bytes=new Uint8Array(S*S*4);for(let i=0;i<bytes.length;i++)bytes[i]=Math.round(Math.min(1,Math.max(0,rgba[i]))*255);

function png(width:number,height:number,data:Uint8Array){
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=(b:Uint8Array)=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type:string,body:Uint8Array)=>{const out=new Uint8Array(12+body.length),view=new DataView(out.buffer);
  view.setUint32(0,body.length);out.set(new TextEncoder().encode(type),4);out.set(body,8);view.setUint32(8+body.length,crc(out.subarray(4,8+body.length)));return out;};
 const header=new Uint8Array(13),hv=new DataView(header.buffer);hv.setUint32(0,width);hv.setUint32(4,height);header.set([8,6,0,0,0],8);
 const raw=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)raw.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',new Uint8Array())];
 const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;
}
writeFileSync(new URL('../public/textures/brush-strokes.png',import.meta.url),png(S,S,bytes));
console.log('wrote public/textures/brush-strokes.png',S,'x',S);
