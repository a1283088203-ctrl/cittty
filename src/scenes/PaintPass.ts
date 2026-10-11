import * as T from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {MOBILE} from '../utils/quality';
import {boilFrame} from '../utils/boil';

/* Painterly post-process (anisotropic Kuwahara, after Kyprianidis et al. and Maxime Heckel's
 * "On Crafting Painterly Shaders"):
 * 1. structure tensor from colour gradients, so every pixel knows the local edge direction;
 * 2. the tensor is blurred to give smooth, flowing stroke directions;
 * 3. an elliptical 8-sector Kuwahara filter oriented along that direction keeps the flattest sector, so surfaces
 *    collapse into flat dabs of paint while edges stay crisp;
 * 4. paper grain and faint strokes along the flow, plus a soft colour posterise.
 * The sky (depth at the far plane) only gets the paper grain. Runs before bloom/tone mapping, in linear HDR. */

const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

const TENSOR=`uniform sampler2D tDiffuse;uniform vec2 texel;varying vec2 vUv;
 vec3 s(vec2 o){return sqrt(clamp(texture2D(tDiffuse,vUv+o*texel).rgb,0.,4.));}
 void main(){
  vec3 fx=(-1.*s(vec2(-1,-1))-2.*s(vec2(-1,0))-1.*s(vec2(-1,1))+1.*s(vec2(1,-1))+2.*s(vec2(1,0))+1.*s(vec2(1,1)))/4.;
  vec3 fy=(-1.*s(vec2(-1,-1))-2.*s(vec2(0,-1))-1.*s(vec2(1,-1))+1.*s(vec2(-1,1))+2.*s(vec2(0,1))+1.*s(vec2(1,1)))/4.;
  gl_FragColor=vec4(dot(fx,fx),dot(fy,fy),dot(fx,fy),1.);}`;

const BLUR=`uniform sampler2D tDiffuse;uniform vec2 texel,dir;varying vec2 vUv;
 void main(){vec4 c=vec4(0.);float w=0.;
  for(int i=-4;i<=4;i++){float g=exp(-float(i*i)/8.);c+=texture2D(tDiffuse,vUv+dir*float(i)*texel)*g;w+=g;}
  gl_FragColor=c/w;}`;

const KUWAHARA=`uniform sampler2D tDiffuse,tTensor,tDepth;uniform vec2 texel;uniform float radius,near,far,refDepth,minScale,maxScale,grainScale;uniform vec4 jitter;varying vec2 vUv;
 // Fixed sample grid (13x13, 7x7 on phones) stretched over the brush, so cost and look do not depend on screen resolution.
 const int N=${MOBILE?3:5};
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 vec3 paper(vec3 c,vec2 flow){
  // Grain is measured in screen-relative units, so it is the same size on a phone and a 4K monitor.
  // Paper grain and flow strokes removed: the image stays clean, only the soft posterise remains.
  // Soft posterise in a perceptual-ish space: flat bands of paint without hard banding.
  vec3 g=sqrt(max(c,0.)),poster=floor(g*14.+.5)/14.;
  return pow(mix(g,poster,.35),vec3(2.));}
 void main(){
  vec4 base=texture2D(tDiffuse,vUv);
  vec3 t=texture2D(tTensor,vUv).xyz; // E=fx.fx, G=fy.fy, F=fx.fy
  float E=t.x,G=t.y,F=t.z,root=sqrt((E-G)*(E-G)+4.*F*F);
  float l1=.5*(E+G+root),l2=.5*(E+G-root);
  vec2 v=vec2(l1-E,-F);vec2 d=length(v)>1e-6?normalize(v):vec2(0.,1.);
  float depth=texture2D(tDepth,vUv).r;
  if(depth>.99999){gl_FragColor=vec4(paper(base.rgb,d),base.a);return;}
  // Brush size shrinks with view distance: a stroke covers about the same patch of the world, so distant
  // buildings shrink on screen without being smeared. Very small brushes skip the filter and keep full detail.
  float viewZ=near*far/(far-depth*(far-near));
  // Brush size is a fraction of the screen height (radius), scaled by distance and clamped between a lower and an
  // upper bound, so every screen size and every zoom level gets the same amount of smudge.
  float rad=radius*clamp(sqrt(refDepth/viewZ),minScale,maxScale);
  float A=l1+l2>1e-6?(l1-l2)/(l1+l2):0.;
  float a=rad*clamp((1.+A),.1,2.),b=rad*clamp(1./(1.+A),.1,2.);
  // Boil: each animation frame turns the strokes a little and changes their length, with the amount varying across the
  // screen, so the paint visibly re-draws itself instead of sitting still.
  float wob=sin(dot(vUv,vec2(37.1,23.7))+jitter.z*30.)*.5+jitter.x;
  float ang=wob*.5;d=mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*d;
  a*=1.+jitter.y*.35;b*=1.-jitter.y*.2;
  float cp=d.x,sp=d.y;
  mat2 SR=mat2(.5/a,0.,0.,.5/b)*mat2(cp,-sp,sp,cp);
  float stepPx=max(a,b)/float(N);
  float zeta=2./rad,zc=.58,szc=sin(zc),eta=(zeta+cos(zc))/(szc*szc);
  vec4 m[8];vec3 s[8];
  for(int k=0;k<8;k++){m[k]=vec4(0.);s[k]=vec3(0.);}
  for(int j=-N;j<=N;j++){
   for(int i=-N;i<=N;i++){
    vec2 off=vec2(float(i),float(j))*stepPx;
    vec2 p=SR*off;if(dot(p,p)>.25)continue;
    // Perceptual space (sqrt): dark night colours spread out, so their edges count as much as daytime ones.
    vec3 c=sqrt(clamp(texture2D(tDiffuse,vUv+off*texel).rgb,0.,1.));
    float w[8];float sum=0.;
    float vx=zeta-eta*p.x*p.x,vy=zeta-eta*p.y*p.y,z;
    z=max(0.,p.y+vx);w[0]=z*z;z=max(0.,-p.x+vy);w[2]=z*z;z=max(0.,-p.y+vx);w[4]=z*z;z=max(0.,p.x+vy);w[6]=z*z;
    vec2 r=.70710678*vec2(p.x-p.y,p.x+p.y);vx=zeta-eta*r.x*r.x;vy=zeta-eta*r.y*r.y;
    z=max(0.,r.y+vx);w[1]=z*z;z=max(0.,-r.x+vy);w[3]=z*z;z=max(0.,-r.y+vx);w[5]=z*z;z=max(0.,r.x+vy);w[7]=z*z;
    for(int k=0;k<8;k++)sum+=w[k];
    float g=exp(-3.125*dot(p,p))/max(sum,1e-6);
    for(int k=0;k<8;k++){float wk=w[k]*g;m[k]+=vec4(c*wk,wk);s[k]+=c*c*wk;}
   }
  }
  // Contrast is judged relative to local brightness, so a dim scene keeps its edges instead of averaging into mush.
  float L=max(dot(sqrt(clamp(base.rgb,0.,1.)),vec3(.333)),.12),norm=1./(L*L);
  vec4 o=vec4(0.);
  for(int k=0;k<8;k++){if(m[k].w<1e-6)continue;vec3 mu=m[k].rgb/m[k].w;vec3 var=abs(s[k]/m[k].w-mu*mu);
   float sigma=(var.r+var.g+var.b)*norm,w=1./(1.+pow(min(sigma*120.,60.),4.));o+=vec4(mu*w,w);}
  vec3 painted=o.w>1e-5?o.rgb/o.w:sqrt(clamp(base.rgb,0.,1.));
  painted*=painted;
  // The filter works on clamped colour; carry over any HDR excess (lamps, lit windows) so bloom still sees it.
  painted+=max(base.rgb-1.,0.);
  gl_FragColor=vec4(paper(painted,d),base.a);}`;

export class PaintPass extends Pass{
 private tensorA=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
 private tensorB=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});
 private tensor=new T.ShaderMaterial({uniforms:{tDiffuse:{value:null},texel:{value:new T.Vector2()}},vertexShader:VERT,fragmentShader:TENSOR,depthTest:false,depthWrite:false});
 private blur=new T.ShaderMaterial({uniforms:{tDiffuse:{value:null},texel:{value:new T.Vector2()},dir:{value:new T.Vector2(1,0)}},vertexShader:VERT,fragmentShader:BLUR,depthTest:false,depthWrite:false});
 /** Brush radius as a fraction of the screen height (0.0075 = about 8 px at 1080p), and its bounds as multiples of
  * that: strokes never get smaller than MIN or larger than MAX, whatever the screen size or zoom. */
 static BRUSH=.0075;static MIN=.6;static MAX=1;
 // refDepth: view distance (world units) at which strokes reach full size; nearer stays full, farther shrinks.
 private paint=new T.ShaderMaterial({uniforms:{tDiffuse:{value:null},tTensor:{value:null},tDepth:{value:null},texel:{value:new T.Vector2()},radius:{value:6},near:{value:.1},far:{value:220},refDepth:{value:24},minScale:{value:PaintPass.MIN},maxScale:{value:PaintPass.MAX},grainScale:{value:1},jitter:{value:new T.Vector4()}},vertexShader:VERT,fragmentShader:KUWAHARA,depthTest:false,depthWrite:false});
 private quad=new FullScreenQuad();
 depth:T.DepthTexture|null=null;
 constructor(private camera:T.PerspectiveCamera){super();}
 setSize(width:number,height:number){
  this.tensorA.setSize(width,height);this.tensorB.setSize(width,height);
  for(const m of [this.tensor,this.blur,this.paint])m.uniforms.texel.value.set(1/width,1/height);
  // Brush and grain are relative to the screen height, with no pixel caps, so a phone and a large monitor look the same.
  this.paint.uniforms.radius.value=PaintPass.BRUSH*height;
  this.paint.uniforms.grainScale.value=1080/height;
 }
 render(renderer:T.WebGLRenderer,writeBuffer:T.WebGLRenderTarget,readBuffer:T.WebGLRenderTarget){
  const run=(material:T.ShaderMaterial,target:T.WebGLRenderTarget|null)=>{this.quad.material=material;renderer.setRenderTarget(target);this.quad.render(renderer);};
  this.tensor.uniforms.tDiffuse.value=readBuffer.texture;run(this.tensor,this.tensorA);
  this.blur.uniforms.tDiffuse.value=this.tensorA.texture;this.blur.uniforms.dir.value.set(1,0);run(this.blur,this.tensorB);
  this.blur.uniforms.tDiffuse.value=this.tensorB.texture;this.blur.uniforms.dir.value.set(0,1);run(this.blur,this.tensorA);
  // The scene depth only lives on this frame's RenderPass target; later passes (tilt-shift) read it from here.
  this.depth=readBuffer.depthTexture;
  (this.paint.uniforms.jitter.value as T.Vector4).fromArray(boilFrame());
  this.paint.uniforms.near.value=this.camera.near;this.paint.uniforms.far.value=this.camera.far;
  this.paint.uniforms.tDiffuse.value=readBuffer.texture;this.paint.uniforms.tTensor.value=this.tensorA.texture;this.paint.uniforms.tDepth.value=readBuffer.depthTexture;
  run(this.paint,this.renderToScreen?null:writeBuffer);
 }
 dispose(){this.tensorA.dispose();this.tensorB.dispose();this.tensor.dispose();this.blur.dispose();this.paint.dispose();this.quad.dispose();}
}
