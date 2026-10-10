import * as T from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
export const defaultGrade=()=>({exposure:0,brightness:0,contrast:1,saturation:1,vibrance:0,temperature:0,tint:0,shadows:0,highlights:0,gamma:1,
 splitShadowHue:220,splitShadowAmt:0,splitHighHue:40,splitHighAmt:0,splitBalance:0,vignette:0,
 hsl:Array.from({length:6},()=>[0,0,0]),curves:{master:[0,.25,.5,.75,1],red:[0,.25,.5,.75,1],green:[0,.25,.5,.75,1],blue:[0,.25,.5,.75,1]}});
export type Grade=ReturnType<typeof defaultGrade>;
/** One grade per time of day; the game blends them as the day turns. */
export type PhaseGrades={day:Grade;dusk:Grade;night:Grade};
export const PHASES=['day','dusk','night'] as const;
export type Phase=typeof PHASES[number];
const SCALARS=['brightness','contrast','saturation','vibrance','temperature','tint','shadows','highlights','gamma','splitShadowHue','splitShadowAmt','splitHighHue','splitHighAmt','splitBalance','vignette'] as const;
export function curveValue(points:number[],x:number){const p=Math.min(4,Math.max(0,x*4)),i=Math.min(3,Math.floor(p));return T.MathUtils.lerp(points[i],points[i+1],p-i);}
export function cloneGrade(g:Grade):Grade{return JSON.parse(JSON.stringify(g));}
/** Hues blend the short way round the colour wheel. */
const lerpHue=(a:number,b:number,t:number)=>{const d=((b-a+540)%360)-180;return (a+d*t+360)%360;};
export function lerpGrade(a:Grade,b:Grade,t:number):Grade{
 if(t<=0)return a;if(t>=1)return b;
 const out=cloneGrade(a),L=T.MathUtils.lerp;
 out.exposure=L(a.exposure,b.exposure,t);
 for(const k of SCALARS)out[k]=k==='splitShadowHue'||k==='splitHighHue'?lerpHue(a[k],b[k],t):L(a[k],b[k],t);
 out.hsl=a.hsl.map((v,i)=>v.map((n,j)=>L(n,b.hsl[i][j],t)));
 for(const k of ['master','red','green','blue'] as const)out.curves[k]=a.curves[k].map((n,i)=>L(n,b.curves[k][i],t));
 return out;
}
/** Day ↔ night by darkness, then toward dusk by the sunset glow (which also covers sunrise). */
export function blendPhases(g:PhaseGrades,night:number,sunset:number){return lerpGrade(lerpGrade(g.day,g.night,night),g.dusk,sunset);}
export class ColorGradePass extends ShaderPass{
 private data=new Uint8Array(256*4);
 private lut:T.DataTexture;
 constructor(){
  super({uniforms:{tDiffuse:{value:null},curve:{value:null},...Object.fromEntries(SCALARS.map(k=>[k,{value:0}])),hsl:{value:Array.from({length:6},()=>new T.Vector3())}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
   uniform sampler2D tDiffuse,curve;uniform float ${SCALARS.join(',')};uniform vec3 hsl[6];varying vec2 vUv;
   const vec3 LW=vec3(.2126,.7152,.0722);
   vec3 rgbHsl(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo,l=(hi+lo)*.5;float h=0.,s=0.;if(d>.00001){s=d/max(.00001,1.-abs(2.*l-1.));if(hi==c.r)h=mod((c.g-c.b)/d,6.);else if(hi==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h=fract(h/6.+1.);}return vec3(h,s,l);}
   vec3 hslRgb(vec3 h){vec3 c=clamp(abs(mod(h.x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);return h.z+(c-.5)*(1.-abs(2.*h.z-1.))*h.y;}
   void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c*=vec3(1.+temperature*.15+tint*.04,1.-tint*.10,1.-temperature*.15+tint*.04);float l=dot(c,LW);c+=shadows*.24*pow(1.-clamp(l,0.,1.),3.)+highlights*.24*pow(clamp(l,0.,1.),3.);c=(c-.5)*contrast+.5+brightness;c=pow(clamp(c,0.,1.),vec3(1./gamma));vec3 v=rgbHsl(c),shift=vec3(0.);for(int i=0;i<6;i++){float d=abs(v.x-float(i)/6.);d=min(d,1.-d);float w=max(0.,1.-d*6.);shift+=hsl[i]*w;}float chroma=smoothstep(0.,.12,v.y);v.x=fract(v.x+shift.x/360.);
    // Vibrance lifts muted colours more than already-saturated ones.
    v.y=clamp(v.y*saturation*(1.+shift.y)*(1.+vibrance*(1.-v.y)),0.,1.);v.z=clamp(v.z+shift.z*.35*chroma,0.,1.);c=hslRgb(v);vec3 uv=(clamp(c,0.,1.)*255.+.5)/256.;c=vec3(texture2D(curve,vec2(uv.r,.5)).r,texture2D(curve,vec2(uv.g,.5)).g,texture2D(curve,vec2(uv.b,.5)).b);
    // Split toning: tint shadows and highlights separately, around a pivot set by the balance. Luminance-neutral.
    float l2=dot(c,LW),pivot=.5+splitBalance*.35;
    float ws=1.-smoothstep(0.,pivot,l2),wh=smoothstep(pivot,1.,l2);
    vec3 ts=hslRgb(vec3(splitShadowHue/360.,1.,.5)),th=hslRgb(vec3(splitHighHue/360.,1.,.5));
    c+=(ts-dot(ts,LW))*splitShadowAmt*ws*.3+(th-dot(th,LW))*splitHighAmt*wh*.3;
    c*=1.-vignette*smoothstep(.3,.85,length((vUv-.5)*vec2(1.25,1.)));
    gl_FragColor=vec4(clamp(c,0.,1.),1.);
   }`});
  this.lut=new T.DataTexture(this.data,256,1,T.RGBAFormat);this.lut.minFilter=T.LinearFilter;this.lut.magFilter=T.LinearFilter;this.lut.generateMipmaps=false;this.uniforms.curve.value=this.lut;this.material.toneMapped=false;this.material.depthTest=false;this.material.depthWrite=false;this.set(defaultGrade());
 }
 set(g:Grade){this.enabled=JSON.stringify({...g,exposure:0})!==JSON.stringify(defaultGrade());for(const k of SCALARS)this.uniforms[k].value=g[k];g.hsl.forEach((v,i)=>this.uniforms.hsl.value[i].set(v[0],v[1],v[2]));for(let i=0;i<256;i++){const master=curveValue(g.curves.master,i/255);for(const [channel,k] of ['red','green','blue'].entries())this.data[i*4+channel]=Math.round(curveValue(g.curves[k as 'red'],master)*255);this.data[i*4+3]=255;}this.lut.needsUpdate=true;}
 override dispose(){this.lut.dispose();super.dispose();}
}
