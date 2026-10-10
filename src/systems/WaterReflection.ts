import * as T from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {fromKey,toWorld} from '../utils/grid';

const waterDaylight={value:1},waterFog={value:new T.Color()};
/** 1 by day, 0 at night: scales the water tones and turns the glints off after dark. */
export function setWaterDaylight(value:number){waterDaylight.value=value;}
/** Live fog colour, so far water fades out exactly like the outer terrain. */
export function setWaterFog(color:T.Color){waterFog.value.copy(color);}

/** One river-shaped reflection target; only buildings and lighting use layer 1. */
export class WaterReflection{
 readonly surface:Reflector;
 constructor(water:Set<string>,bridges:Set<string>,outer:[number,number][]=[]){
  const planes=[...water].filter(k=>!bridges.has(k)).map(k=>{const p=toWorld(fromKey(k));return new T.PlaneGeometry(1.5,1.5).translate(p.x,-p.z,0);});
  for(const [x,z] of outer)planes.push(new T.PlaneGeometry(3.01,3.01).translate(x,-z,0));
  const geometry=mergeGeometries(planes,false)!;planes.forEach(p=>p.dispose());
  const mobile=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches,size=mobile?256:512;
  this.surface=new Reflector(geometry,{textureWidth:size,textureHeight:size,multisample:0,clipBias:.003,color:0x5b9ca8,shader:{
   uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},time:{value:0}},
   vertexShader:`uniform mat4 textureMatrix;varying vec4 reflectedUv;varying vec2 riverPosition;
    void main(){riverPosition=position.xy;reflectedUv=textureMatrix*vec4(position,1.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`uniform sampler2D tDiffuse;uniform vec3 color,fogTint;uniform float time,daylight;varying vec4 reflectedUv;varying vec2 riverPosition;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
    float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}
    void main(){
     // Every effect is snapped to a 0.1-unit grid so it lands on the game's pixel grain.
     vec2 px=riverPosition;
     vec2 uv=reflectedUv.xy/reflectedUv.w;uv.x+=sin(px.y*5.0+time*.9)*.0025;uv.y+=sin(px.x*3.0+time*.65)*.0012;
     vec3 reflection=texture2D(tDiffuse,clamp(uv,0.0,1.0)).rgb;
     vec3 water=vec3(.3,.62,.82)*mix(.28,1.,daylight);
     vec3 c=mix(water,reflection,mix(.7,.38,daylight));
     // Glints: short horizontal dashes on a stretched grid, each twinkling on its own phase.
     vec2 cell=floor(riverPosition*vec2(5.,12.));float h=hash(cell);
     float glint=step(.86,h)*smoothstep(.55,.95,sin(time*(1.5+h*2.)+h*40.));
     // Fine sparkle points that flash briefly.
     float h2=hash(floor(riverPosition*14.)+7.3);
     float spark=step(.975,h2)*step(.7,sin(time*3.+h2*60.));
     // By day the glints are bright white; at night they stay on as a faint, cool moonlit shimmer.
     float shine=max(glint*.85,spark)*mix(.32,1.,daylight);
     vec3 glow=mix(vec3(.62,.74,.9),vec3(1.,1.,.96),daylight);
     // Same distance fade as the outer terrain (17..43 units, 6 dithered steps), so the far river
     // dissolves into the haze with the land instead of ending in a hard edge at dusk and night.
     float fade=smoothstep(17.,43.,length(riverPosition));     gl_FragColor=vec4(mix(mix(c,glow,shine),fogTint,fade),mix(mix(.72,1.,shine),1.,fade));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  }});
  // Shared, so one call per frame dims the water and its glints for dusk and night.
  (this.surface.material as T.ShaderMaterial).uniforms.daylight=waterDaylight;
  (this.surface.material as T.ShaderMaterial).uniforms.fogTint=waterFog;
  this.surface.name='river-reflection';this.surface.rotation.x=-Math.PI/2;this.surface.position.y=-.154;
  const material=this.surface.material as T.ShaderMaterial;material.transparent=true;material.depthWrite=false;
  // Blend colour only and keep the tile's alpha: outer scenery is tagged alpha .75 so the boundary pass skips it.
  // Overwriting that tag drew a dark outline where the far water tiles meet the sky.
  Object.assign(material,{blending:T.CustomBlending,blendSrc:T.SrcAlphaFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor});
  this.surface.camera.layers.set(1);
  const texture=this.surface.getRenderTarget().texture;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
  const render=this.surface.onBeforeRender;let last=-Infinity;
  this.surface.onBeforeRender=(...args)=>{const now=performance.now();if(now-last<(mobile?125:66))return;last=now;render.apply(this.surface,args);};
 }
 update(time:number){(this.surface.material as T.ShaderMaterial).uniforms.time.value=time;}
 dispose(){this.surface.removeFromParent();this.surface.geometry.dispose();this.surface.dispose();}
}
