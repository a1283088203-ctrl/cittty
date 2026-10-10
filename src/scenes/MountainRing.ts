import * as T from 'three';
import {cloudMask,CLOUD_W,CLOUD_H} from '../utils/clouds';
const WHITE=new T.Color(1,1,1);

/** Distant ridge silhouettes on an open cylinder around the city.
 * The texture holds layer masks (R far, G mid, B near); colors follow the live fog so the ring stays in the haze.
 */
export class MountainRing{
 readonly mesh:T.Mesh;
 private readonly far=new T.Color();private readonly mid=new T.Color();private readonly near=new T.Color();private readonly tint=new T.Color();private readonly haze=new T.Color();
 private readonly cloudBack=new T.Color();private readonly cloudFront=new T.Color();private readonly drift={value:0};
 private readonly cloudTexture=new T.DataTexture(new Uint8Array(CLOUD_W*CLOUD_H*4),CLOUD_W,CLOUD_H);
 /** Per-layer texture offsets (far ridge, mid ridge, far clouds, near clouds), in ring turns. */
 private readonly parallax=new T.Vector4();private readonly look=new T.Vector3();private yaw=0;private lastAzimuth?:number;
 /** How much each layer turns along with the camera: 0 = fixed in the world (moves normally), 1 = stuck to the view.
  * Near ridge 0, then near clouds, mid ridge, far clouds and far ridge follow more, so each deeper layer moves slower. */
 static readonly FOLLOW={nearClouds:.25,midRidge:.45,farClouds:.6,farRidge:.75};
 /** Call once per frame before rendering. Tracks the unwrapped view azimuth so offsets never jump at ±180°. */
 setView(camera:T.Camera){
  camera.getWorldDirection(this.look);
  const azimuth=Math.atan2(this.look.x,this.look.z);
  if(this.lastAzimuth!==undefined){let delta=azimuth-this.lastAzimuth;delta-=Math.round(delta/(Math.PI*2))*Math.PI*2;this.yaw+=delta;}
  this.lastAzimuth=azimuth;
  const turns=this.yaw/(Math.PI*2),f=MountainRing.FOLLOW;
  this.parallax.set(turns*f.farRidge,turns*f.midRidge,turns*f.farClouds,turns*f.nearClouds);
 }
 /** Scatter a fresh set of clouds at random positions around the ring. */
 rerollClouds(seed=Math.floor(Math.random()*2**31)){
  (this.cloudTexture.image.data as Uint8Array).set(cloudMask(seed));this.cloudTexture.needsUpdate=true;this.drift.value=0;
 }
 constructor(scene:T.Scene,radius=118,base=-6,top=30){
  const texture=new T.TextureLoader().load(new URL('textures/mountains.png',document.baseURI).href);
  texture.wrapS=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;
  // Extends well below the horizon so the solid foothill band hides the void beneath the scenery tiles.
  const bottom=base-40,geometry=new T.CylinderGeometry(radius,radius,top-bottom,96,1,true).translate(0,(top+bottom)/2,0);
  // Cloud mask on the same rows as the ridges, regenerated for every new city (see rerollClouds).
  const clouds=this.cloudTexture;
  clouds.wrapS=T.RepeatWrapping;clouds.magFilter=T.LinearFilter;clouds.minFilter=T.LinearFilter;clouds.generateMipmaps=false;
  this.rerollClouds();
  const material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
   uniforms:{map:{value:texture},clouds:{value:clouds},far:{value:this.far},mid:{value:this.mid},near:{value:this.near},cloudBack:{value:this.cloudBack},cloudFront:{value:this.cloudFront},drift:this.drift,parallax:{value:this.parallax},range:{value:new T.Vector2(base,top)},repeats:{value:3},haze:{value:this.haze},hazeHeight:{value:.5}},
   vertexShader:'varying vec2 vUv;varying float vY;void main(){vUv=uv;vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`uniform sampler2D map,clouds;uniform vec3 far,mid,near,cloudBack,cloudFront,haze;uniform vec2 range;uniform vec4 parallax;uniform float repeats,hazeHeight,drift;varying vec2 vUv;varying float vY;
    float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
    float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}
    void main(){float v=(vY-range.x)/(range.y-range.x);
     // Parallax: each layer is sampled at its own offset (see setView), so deeper layers turn slower with the camera.
     // Below the horizon only the solid near foothill band is drawn.
     float u=vUv.x;bool below=v<0.;
     float mFar=below?0.:texture2D(map,vec2((u-parallax.x)*repeats,v)).r;
     float mMid=below?0.:texture2D(map,vec2((u-parallax.y)*repeats,v)).g;
     float mNear=below?1.:texture2D(map,vec2(u*repeats,v)).b;
     // The cloud texture spans the whole ring once (it is 3x the mountain texture's width).
     float kFar=below?0.:texture2D(clouds,vec2(u-parallax.z+drift,v)).r;
     float kNear=below?0.:texture2D(clouds,vec2(u-parallax.w+drift,v)).g;
     if(mFar<.5&&mMid<.5&&mNear<.5&&kFar<.25&&kNear<.25)discard;
     // Back to front: far ridge, far clouds, mid ridge, near clouds, near ridge.
     vec3 c=far;bool cloud=false;
     if(kFar>.25){c=mix(kFar>.75?cloudFront:cloudBack,haze,.18);cloud=true;}
     if(mMid>.5){c=mid;cloud=false;}
     if(kNear>.25){c=kNear>.75?cloudFront:cloudBack;cloud=true;}
     if(mNear>.5){c=near;cloud=false;}
     // Ground haze: the ridge feet dissolve into the fog color, dithered in the same pixel steps as the scene fog.
     // Low clouds only fade right at their base, so they stay white just above the horizon.
     float h=1.-smoothstep(-.05,cloud?hazeHeight*.45:hazeHeight,v);     c=mix(c,haze,clamp(h,0.,1.));
     // Same alpha tag as the outer scenery so the boundary pass leaves the silhouettes untouched.
     gl_FragColor=vec4(c,.75);}`});
  this.mesh=new T.Mesh(geometry,material);this.mesh.name='mountain-ring';this.mesh.frustumCulled=false;this.mesh.renderOrder=-9000;
  scene.add(this.mesh);
 }
 /** Farther ridges sit closer to the haze; nearer ones are a little denser and cooler. */
 update(fog:T.Color,sky:T.Color,dt=0,sunset=0,night=0){
  // The outer scenery fades to exactly the fog color, so the ridge feet do too.
  this.haze.copy(fog);
  // Clouds start from the fog colour and are lifted towards white. By day they are nearly white; at sunrise,
  // sunset and night the lift shrinks, so they take on the sky's hue instead of standing out as grey shapes.
  const light=Math.min(1,(fog.r*.2126+fog.g*.7152+fog.b*.0722)/.78),lift=(1-.72*sunset)*(1-.85*night);
  const highlight=this.tint.setHex(0xffc6a4).lerp(WHITE,1-sunset).multiplyScalar(light);
  this.cloudFront.copy(fog).lerp(highlight,.9*lift);
  this.cloudBack.copy(fog).lerp(sky,.3).lerp(highlight,.72*lift);
  this.drift.value=(this.drift.value+dt*.0015)%1;
  // A clean sky-blue tint, scaled to the fog's brightness so dusk and night stay in key; less darkening keeps it from greying out.
  const tint=this.tint.setHex(0x7aa6d8).multiplyScalar((fog.r+fog.g+fog.b)/1.7);
  this.far.copy(fog).lerp(sky,.3).lerp(tint,.16);
  this.mid.copy(fog).lerp(sky,.15).lerp(tint,.32).multiplyScalar(.95);
  this.near.copy(fog).lerp(tint,.46).multiplyScalar(.9);
 }
}
