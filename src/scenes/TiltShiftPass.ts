import * as T from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {MOBILE} from '../utils/quality';
import {boilFrame} from '../utils/boil';

/* Miniature ("tilt-shift") depth of field. The camera focuses on the ground point at the centre of the view, so
 * the city there stays sharp while nearer and farther things blur with their distance from that focus, plus a soft
 * screen band that blurs the top and bottom edges even more, like a tilted lens. A slight saturation lift finishes
 * the toy-model look.
 * Two separable gather passes (horizontal, vertical). Blur radius is a fraction of the screen height with a fixed
 * tap count, so it looks the same on a phone and a large monitor. Samples sharper than the pixel being blurred are
 * left out, so in-focus buildings do not smear a halo into the blurred background behind them. */

const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const FRAG=`uniform sampler2D tDiffuse,tDepth,tBrush;uniform vec2 texel,brushScale;uniform vec4 jitter;uniform float near,far,focus,maxRadius,band,depthRange,saturation;uniform bool finalPass;varying vec2 vUv;
 const int N=${MOBILE?4:8};
 // The first pass works out the blur amount from depth and stores it in alpha; the second pass reads it back from
 // there, so it never samples the depth texture attached to the framebuffer it draws into (a WebGL feedback loop).
 float coc(vec2 uv){
  float result=0.;
  // The sign of the stored alpha flags sky pixels (see main), so the magnitude is the blur amount.
  if(finalPass)result=abs(texture2D(tDiffuse,uv).a);
  else{
   // Background only: things nearer than the focus point and the bottom of the screen stay sharp.
   float d=texture2D(tDepth,uv).r,z=near*far/(far-d*(far-near));
   float byDepth=smoothstep(.06,depthRange,max(z-focus,0.)/focus);
   float byBand=smoothstep(band,band+.3,uv.y-.5);
   result=clamp(max(byDepth,byBand*.9),0.,1.);
  }
  return result;
 }
 void main(){
  vec4 base=texture2D(tDiffuse,vUv);
  float c0=coc(vUv),r=c0*maxRadius;
  vec3 col=base.rgb;
  // Brush mask: RG stroke direction, B bristles, A stroke coverage. The first pass smears along the stroke, the
  // second only a little across it, so the blur reads as dabs of a flat brush instead of an even lens blur.
  // Boil: every animation frame slides the stroke mask to a new random spot, so the smears re-draw in place.
  vec4 brush=texture2D(tBrush,vUv*brushScale+jitter.xy*.6+jitter.zw*.2);
  vec2 sd=brush.rg*2.-1.;sd=dot(sd,sd)>.01?normalize(sd):vec2(.94,-.34);
  vec2 dir=finalPass?vec2(-sd.y,sd.x):sd;
  // The sky gets a plain soft blur: brush streaks and bristle tone on a smooth gradient read as dirty marks.
  float sky=finalPass?step(base.a,-.5):step(.99999,texture2D(tDepth,vUv).r);
  float cover=smoothstep(.15,.85,brush.a)*(1.-sky);
  // Along: long where a stroke covers, shorter in the gaps between strokes. Across: short, so stroke edges survive.
  r*=finalPass?.22+.12*cover:.45+1.25*cover;
  // Sky: an even horizontal-then-vertical blur instead of brush-directed smears.
  if(sky>.5){dir=finalPass?vec2(0.,1.):vec2(1.,0.);r=c0*maxRadius*.8;}
  // Bristles drag the paint sideways, giving each stroke streaky edges.
  vec2 drag=vec2(-dir.y,dir.x)*(brush.b-.5)*c0*maxRadius*.7*texel*(1.-sky);
  if(r>.5){
   vec3 sum=vec3(0.);float wsum=0.;
   for(int i=-N;i<=N;i++){
    float t=float(i)/float(N);vec2 uv=vUv+drag+dir*texel*t*r;
    float ci=coc(uv),w=exp(-t*t*2.);
    if(i!=0)w*=clamp(ci/max(c0,1e-3),0.,1.);
    sum+=texture2D(tDiffuse,uv).rgb*w;wsum+=w;
   }
   col=sum/max(wsum,1e-4);
  }
  if(finalPass){
   // Faint bristle tone inside the smeared areas only; the in-focus city stays clean.
   col*=1.+(brush.b-.5)*.16*c0*cover;
   float l=dot(col,vec3(.2126,.7152,.0722));col=max(mix(vec3(l),col,saturation),0.);gl_FragColor=vec4(col,1.);}
  else gl_FragColor=vec4(col,sky>.5?-max(c0,.01):c0);
 }`;

export class TiltShiftPass extends Pass{
 /** Max blur radius as a fraction of the screen height; focus band half-height (screen fraction) kept sharp;
  * relative depth difference at which the blur is full; saturation lift. */
 static RADIUS=.016;static BAND=.14;static DEPTH_RANGE=.55;static SATURATION=1.12;
 private temp=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
 /** Height of one brush-mask tile as a fraction of the screen height. */
 static BRUSH_TILE=.4;
 private brush=TiltShiftPass.loadBrush();
 private material=new T.ShaderMaterial({uniforms:{tDiffuse:{value:null},tDepth:{value:null},tBrush:{value:this.brush},texel:{value:new T.Vector2()},brushScale:{value:new T.Vector2(1,1)},jitter:{value:new T.Vector4()},
  near:{value:.1},far:{value:220},focus:{value:40},maxRadius:{value:10},band:{value:TiltShiftPass.BAND},depthRange:{value:TiltShiftPass.DEPTH_RANGE},
  saturation:{value:TiltShiftPass.SATURATION},finalPass:{value:false}},vertexShader:VERT,fragmentShader:FRAG,depthTest:false,depthWrite:false});
 private quad=new FullScreenQuad(this.material);
 private ray=new T.Vector3();
 constructor(private camera:T.PerspectiveCamera,private depth:()=>T.Texture|null,private target?:T.Vector3){super();}
 setSize(width:number,height:number){
  this.temp.setSize(width,height);this.material.uniforms.texel.value.set(1/width,1/height);
  this.material.uniforms.maxRadius.value=TiltShiftPass.RADIUS*height;
  // Square tiles sized to the screen height, so strokes look the same on every screen and aspect ratio.
  this.material.uniforms.brushScale.value.set(width/height/TiltShiftPass.BRUSH_TILE,1/TiltShiftPass.BRUSH_TILE);
 }
 /** Stroke field generated by scripts/brushStrokes.ts. Until it loads, the blank texture falls back to a plain blur. */
 private static loadBrush(){
  if(typeof document==='undefined')return new T.Texture();
  const texture=new T.TextureLoader().load(new URL('textures/brush-strokes.png',document.baseURI).href);
  // Data, not colour: directions must not be gamma-decoded.
  texture.colorSpace=T.NoColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;
  return texture;
 }
 /** Focus distance: the orbit centre (the city), so looking across the map at a low angle never moves focus onto
  * the far mountains. Without a target it falls back to where the view's centre ray meets the ground. */
 private focusDistance(){
  // Focus a little beyond the orbit centre so the whole city block, including its far side, stays sharp.
  if(this.target)return this.camera.position.distanceTo(this.target)*1.15;
  this.camera.getWorldDirection(this.ray);
  const t=this.ray.y<-.05?(1-this.camera.position.y)/this.ray.y:-1;
  return t>0?t:this.camera.position.length();
 }
 render(renderer:T.WebGLRenderer,writeBuffer:T.WebGLRenderTarget,readBuffer:T.WebGLRenderTarget){
  const depth=this.depth(),u=this.material.uniforms;
  if(!depth)return;
  u.tDepth.value=depth;u.near.value=this.camera.near;u.far.value=this.camera.far;u.focus.value=this.focusDistance();
  (u.jitter.value as T.Vector4).fromArray(boilFrame());
  u.tDiffuse.value=readBuffer.texture;u.finalPass.value=false;
  renderer.setRenderTarget(this.temp);this.quad.render(renderer);
  // Unbind the depth texture: the second pass may draw into the target that owns it.
  u.tDiffuse.value=this.temp.texture;u.tDepth.value=null;u.finalPass.value=true;
  renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
 }
 dispose(){this.temp.dispose();this.brush.dispose();this.material.dispose();this.quad.dispose();}
}
