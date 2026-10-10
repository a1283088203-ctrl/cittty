import * as T from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
export const defaultGrade=()=>({exposure:0,brightness:0,contrast:1,saturation:1,temperature:0,tint:0,shadows:0,highlights:0,gamma:1,hsl:Array.from({length:6},()=>[0,0,0]),curves:{master:[0,.25,.5,.75,1],red:[0,.25,.5,.75,1],green:[0,.25,.5,.75,1],blue:[0,.25,.5,.75,1]}});
export type Grade=ReturnType<typeof defaultGrade>;
export function curveValue(points:number[],x:number){const p=Math.min(4,Math.max(0,x*4)),i=Math.min(3,Math.floor(p));return T.MathUtils.lerp(points[i],points[i+1],p-i);}
export class ColorGradePass extends ShaderPass{
 private data=new Uint8Array(256*4);
 private lut:T.DataTexture;
 constructor(){
  super({uniforms:{tDiffuse:{value:null},curve:{value:null},brightness:{value:0},contrast:{value:1},saturation:{value:1},temperature:{value:0},tint:{value:0},shadows:{value:0},highlights:{value:0},gamma:{value:1},hsl:{value:Array.from({length:6},()=>new T.Vector3())}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
   uniform sampler2D tDiffuse,curve;uniform float brightness,contrast,saturation,temperature,tint,shadows,highlights,gamma;uniform vec3 hsl[6];varying vec2 vUv;
   vec3 rgbHsl(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo,l=(hi+lo)*.5;float h=0.,s=0.;if(d>.00001){s=d/max(.00001,1.-abs(2.*l-1.));if(hi==c.r)h=mod((c.g-c.b)/d,6.);else if(hi==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h=fract(h/6.+1.);}return vec3(h,s,l);}
   vec3 hslRgb(vec3 h){vec3 c=clamp(abs(mod(h.x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);return h.z+(c-.5)*(1.-abs(2.*h.z-1.))*h.y;}
   void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c*=vec3(1.+temperature*.15+tint*.04,1.-tint*.10,1.-temperature*.15+tint*.04);float l=dot(c,vec3(.2126,.7152,.0722));c+=shadows*.24*pow(1.-clamp(l,0.,1.),3.)+highlights*.24*pow(clamp(l,0.,1.),3.);c=(c-.5)*contrast+.5+brightness;c=pow(clamp(c,0.,1.),vec3(1./gamma));vec3 v=rgbHsl(c),shift=vec3(0.);for(int i=0;i<6;i++){float d=abs(v.x-float(i)/6.);d=min(d,1.-d);float w=max(0.,1.-d*6.);shift+=hsl[i]*w;}float chroma=smoothstep(0.,.12,v.y);v.x=fract(v.x+shift.x/360.);v.y=clamp(v.y*saturation*(1.+shift.y),0.,1.);v.z=clamp(v.z+shift.z*.35*chroma,0.,1.);c=hslRgb(v);vec3 uv=(clamp(c,0.,1.)*255.+.5)/256.;c=vec3(texture2D(curve,vec2(uv.r,.5)).r,texture2D(curve,vec2(uv.g,.5)).g,texture2D(curve,vec2(uv.b,.5)).b);gl_FragColor=vec4(c,1.);
   }`});
  this.lut=new T.DataTexture(this.data,256,1,T.RGBAFormat);this.lut.minFilter=T.LinearFilter;this.lut.magFilter=T.LinearFilter;this.lut.generateMipmaps=false;this.uniforms.curve.value=this.lut;this.material.toneMapped=false;this.material.depthTest=false;this.material.depthWrite=false;this.set(defaultGrade());
 }
 set(g:Grade){this.enabled=JSON.stringify({...g,exposure:0})!==JSON.stringify(defaultGrade());for(const k of ['brightness','contrast','saturation','temperature','tint','shadows','highlights','gamma'] as const)this.uniforms[k].value=g[k];g.hsl.forEach((v,i)=>this.uniforms.hsl.value[i].set(v[0],v[1],v[2]));for(let i=0;i<256;i++){const master=curveValue(g.curves.master,i/255);for(const [channel,k] of ['red','green','blue'].entries())this.data[i*4+channel]=Math.round(curveValue(g.curves[k as 'red'],master)*255);this.data[i*4+3]=255;}this.lut.needsUpdate=true;}
 override dispose(){this.lut.dispose();super.dispose();}
}


