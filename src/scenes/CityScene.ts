import {SkyGradient} from './SkyGradient';
import {MountainRing} from './MountainRing';
import {setWaterDaylight,setWaterFog} from '../systems/WaterReflection';
import {PHASE_GRADES} from '../data/colorGrade';
import {ColorGradePass,blendPhases,type Grade,type PhaseGrades} from './ColorGradePass';
import {PaintPass} from './PaintPass';
import {TiltShiftPass} from './TiltShiftPass';
import {installPaintChunks} from '../utils/paint';
import {MOBILE} from '../utils/quality';
import * as T from 'three';
import {box} from '../utils/mesh';
import {STAGES} from '../data/progression';
import type {TimeOfDaySystem} from '../systems/TimeOfDaySystem';
import {setNightLights} from '../utils/mesh';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {CRT_SHADER} from './CrtPass';
export class CityScene{
 skyGradient:SkyGradient;mountains:MountainRing;
 scene=new T.Scene();renderer:T.WebGLRenderer;sun=new T.DirectionalLight(0xffe2ba,2.5);ambient=new T.HemisphereLight(0xdff5ed,0x647557,2);private stage=0;
 colorGrade?:ColorGradePass;paint?:PaintPass;tiltShift?:TiltShiftPass;composer?:EffectComposer;bloom?:UnrealBloomPass;crt?:ShaderPass;bloomScale=1;private bloomStage=0;private streetLights=[new T.PointLight(0xffd7a1,0,4,2),new T.PointLight(0xffd7a1,0,4,2)];
 /** Warm night spill from lit buildings: a fixed pool (so shaders never recompile) parked at the doors of the
  * buildings nearest the view centre. */
 static BUILDING_LIGHTS=MOBILE?3:8;private buildingLights=Array.from({length:CityScene.BUILDING_LIGHTS},()=>new T.PointLight(0xffc98a,0,3.6,1.6));private lightSpot=new T.Vector3();
 constructor(parent:HTMLElement){
  // Smooth painted fog (bayer4 stays defined: the scenery fog hooks still call it, now as a no-op offset).
  T.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG\nuniform vec3 fogColor;varying float vFogDepth;\n#ifdef FOG_EXP2\nuniform float fogDensity;\n#else\nuniform float fogNear;uniform float fogFar;\n#endif\nfloat bayer4(vec2 a){return .5;}\n#endif`;
  T.ShaderChunk.fog_fragment=`#ifdef USE_FOG\n#ifdef FOG_EXP2\nfloat fogFactor=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);\n#else\nfloat fogFactor=smoothstep(fogNear,fogFar,vFogDepth);\n#endif\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);\n#endif`;
  installPaintChunks();
  // Stylized shadows: cast areas pick up a strong cool blue-grey scaled by the light's own energy; lit and ambient-lit pixels keep their original colors.
  const dirShadow='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  const lum='dot( directLight.color, vec3( .2126, .7152, .0722 ) )';
  // Form shade uses the same colour: faces turned away from the sun fade into the cast-shadow blue-grey instead of
  // going muddy dark, so the shaded side of a house and the shadow it throws read as one luminous colour.
  // paintSun / paintLit hand the sun's shadow factor to the Lambert BRDF (point and spot lights keep plain Lambert).
  T.ShaderChunk.lights_fragment_begin=T.ShaderChunk.lights_fragment_begin.replace(`directLight.color *= ( directLight.visible && receiveShadow ) ? ${dirShadow} : 1.0;`,`paintSun = 1.0; paintLit = ( directLight.visible && receiveShadow ) ? ${dirShadow} : 1.0;`).replace('pointLight = pointLights[ i ];','pointLight = pointLights[ i ]; paintSun = 0.0;').replace('spotLight = spotLights[ i ];','spotLight = spotLights[ i ]; paintSun = 0.0;');
  T.ShaderChunk.lights_lambert_pars_fragment=T.ShaderChunk.lights_lambert_pars_fragment.replace('vec3 irradiance = dotNL * directLight.color;',`vec3 irradiance = dotNL * directLight.color;
	// The fixed blue-grey only suits a warm sun. Under the already-blue moonlight it turned shaded grass a saturated
	// teal, so the tint fades with the light's warmth: at night shade is simply dimmer moonlight, same hue as lit ground.
	float paintWarm = smoothstep( 0., .3, ( directLight.color.r - directLight.color.b ) / max( max( directLight.color.r, directLight.color.b ), 1e-4 ) );
	vec3 paintShade = mix( directLight.color * .24, vec3( .15, .24, .50 ) * ${lum}, paintWarm );
	if ( paintSun > .5 ) irradiance = mix( paintShade, directLight.color, dotNL * paintLit );`).replace('varying vec3 vViewPosition;','varying vec3 vViewPosition;\nfloat paintSun = 0.0; float paintLit = 1.0;');
  this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(this.pixelScale(innerWidth,innerHeight));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.setClearColor(0xc9deda);parent.append(this.renderer.domElement);
 this.scene.fog=new T.Fog(0xc9deda,70,160);this.scene.add(this.ambient,this.sun);this.sun.position.set(-15,30,18);this.sun.castShadow=true;// The shadow area covers the whole scenery ring (±52), not just the city, so background hills, mountains and trees
 // get light and shade too. A larger map keeps the city's shadows about as sharp as before.
 const shadowSize=MOBILE?1024:4096;this.sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(this.sun.shadow.camera,{left:-52,right:52,top:52,bottom:-52,near:1,far:220});this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.04;
 box(this.scene,24,1,24,0,-.85,0,0x9a9870);box(this.scene,24.6,.4,24.6,0,-1.2,0,0x557f78);box(this.scene,25,.18,25,0,-1.48,0,0x789a87);
 for(const s of [-1,1]){box(this.scene,24.5,.3,.25,0,.05,s*12.2,0xe3d7b8);box(this.scene,.25,.3,24.5,s*12.2,.05,0,0xe3d7b8);}
 this.skyGradient=new SkyGradient(this.scene);this.mountains=new MountainRing(this.scene);this.setStage(0);
 }
 enablePostProcessing(camera:T.PerspectiveCamera,focusTarget?:T.Vector3){
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=Math.pow(2,this.grades.day.exposure);
  this.composer=new EffectComposer(this.renderer);for(const target of [this.composer.renderTarget1,this.composer.renderTarget2])target.depthTexture=new T.DepthTexture(target.width,target.height,T.UnsignedIntType);this.composer.addPass(new RenderPass(this.scene,camera));
  // Painterly Kuwahara pass replaces the old depth-outline BoundaryPass (file kept, no longer in the chain).
  this.paint=new PaintPass(camera);this.composer.addPass(this.paint);
  // Miniature depth of field on top of the painted image, before bloom so lamp glows stay round.
  const paint=this.paint;this.tiltShift=new TiltShiftPass(camera,()=>paint.depth,focusTarget);this.composer.addPass(this.tiltShift);
  this.bloom=new UnrealBloomPass(new T.Vector2(innerWidth/2,innerHeight/2),.12,.18,1.25);this.composer.addPass(this.bloom);
  // Soft knee: brightness ramps into the bloom over a wide band rather than a hard 0.01 cutoff.
  (this.bloom.highPassUniforms as {smoothWidth:{value:number}}).smoothWidth.value=.35;this.composer.addPass(new OutputPass());this.colorGrade=new ColorGradePass();this.colorGrade.set(this.grades.day);this.composer.addPass(this.colorGrade);
  this.crt=new ShaderPass(CRT_SHADER);this.crt.enabled=false;this.composer.addPass(this.crt);
  this.scene.add(...this.streetLights,...this.buildingLights);for(const light of [this.sun,this.ambient,...this.streetLights,...this.buildingLights])light.layers.enable(1);
 }
 setStage(index:number){this.stage=index;}
 applyLighting(time:TimeOfDaySystem,dt:number){
  this.scene.background=null;
  this.skyGradient.update(time.night,time.hour);(this.scene.fog as T.Fog).color.copy(this.skyGradient.fogColor);this.mountains.update(this.skyGradient.fogColor,this.skyGradient.material.uniforms.upper.value,dt,this.skyGradient.sunset,time.night);
  this.sun.color.copy(time.sun);this.sun.intensity=time.sunPower;this.ambient.color.copy(time.ambient);this.ambient.intensity=time.ambientPower;
  const angle=(time.hour-6)/24*Math.PI*2;// Same sun direction as before, pushed out to 110 units so the wider shadow box never clips scenery behind the light.
  this.sun.position.set(Math.cos(angle)*28,Math.max(9,Math.sin(angle)*35),18).setLength(110);
  this.applyGrade(time.night,this.skyGradient.sunset);
  setNightLights(time.night,dt);setWaterDaylight(1-time.night);setWaterFog(this.skyGradient.fogColor);
  this.bloomStage+=(STAGES[Math.max(0,this.stage)].bloom-this.bloomStage)*(1-Math.exp(-dt*.25));
  if(this.bloom){
   // Daylight highlights need a visible baseline; keep the established night glow.
   // Lower thresholds with a wide soft knee (smoothWidth in the constructor): moderately bright surfaces, lamps and
   // lit windows glow a little, and the glow grows smoothly with brightness instead of only kicking in near white.
   this.bloom.strength=T.MathUtils.lerp(.26+this.bloomStage*.45,.3+this.bloomStage,time.night)*this.bloomScale;
   this.bloom.threshold=T.MathUtils.lerp(.62,.5,time.night);
   this.bloom.radius=.12+this.bloomStage*.15;
  }
 }
 /** Each building lights the ground, road and neighbours around its front door at night; bigger buildings spill
  * more (more lit windows). Lights go to the buildings closest to `focus`, the rest stay off. */
 setBuildingLights(buildings:{mesh:T.Object3D;data:{width:number;depth:number;height:number;level:number}}[],focus:T.Vector3,night:number){
  const near=buildings.map(b=>({b,d:b.mesh.position.distanceToSquared(focus)})).sort((a,b)=>a.d-b.d);
  this.buildingLights.forEach((light,i)=>{
   const entry=near[i];
   if(!entry||night<.01){light.intensity=0;return;}
   const {mesh,data}=entry.b;
   // Just outside the front wall, a little above the door, so light pools on the ground in front.
   light.position.copy(mesh.localToWorld(this.lightSpot.set(0,-data.height/2+.9,data.depth/2+.45)));
   light.distance=3.2+Math.min(data.width,4)*.35;
   light.intensity=night*(2.2+Math.min(data.level,6)*.35);
  });
 }
 /** Grades for day, dusk (also sunrise) and night; blended every frame by the light. `override` shows one grade as is
  * (the colour lab's compare button uses the neutral grade). */
 grades:PhaseGrades=PHASE_GRADES();gradeOverride:Grade|null=null;private gradeKey='';
 private applyGrade(night:number,sunset:number){
  if(!this.colorGrade)return;
  // Only re-upload the LUT when the blend actually moved (it eases slowly, so most frames skip).
  const key=this.gradeOverride?'o'+JSON.stringify(this.gradeOverride):`${night.toFixed(3)}|${sunset.toFixed(3)}|${this.gradeRevision}`;
  if(key===this.gradeKey)return;this.gradeKey=key;
  const g=this.gradeOverride??blendPhases(this.grades,night,sunset);
  this.colorGrade.set(g);this.renderer.toneMappingExposure=Math.pow(2,g.exposure);
 }
 /** Bump after editing `grades` in place so the next frame re-applies them. */
 gradeRevision=0;
 setStreetLights(positions:T.Vector3[],night:number){this.streetLights.forEach((light,i)=>{light.intensity=positions[i]?night*2.4:0;if(positions[i])light.position.copy(positions[i]);});}
 render(camera:T.PerspectiveCamera){this.mountains.setView(camera);if(this.composer)this.composer.render();else this.renderer.render(this.scene,camera);}
 /** Native-resolution painted look, so zoomed-out detail stays sharp. The buffer is capped at 2560x1440 on desktop
  * and 1920x1080 on phones; brush size scales with it (PaintPass.setSize), so strokes look the same. */
 // Phones render at most 1280x720: the paint and blur passes cost per pixel, and high-DPI phones otherwise stall.
 private pixelScale(w:number,h:number){
  return Math.min(devicePixelRatio,MOBILE?1.5:2,(MOBILE?1280:2560)/Math.max(w,h),(MOBILE?720:1440)/Math.min(w,h));}
 setCrt(on:boolean){if(this.crt)this.crt.enabled=on;}
 resize(w:number,h:number){const scale=this.pixelScale(w,h);this.renderer.setPixelRatio(scale);this.renderer.setSize(w,h);if(this.composer){this.composer.setPixelRatio(scale);this.composer.setSize(w,h);}if(this.crt)(this.crt.uniforms.resolution.value as T.Vector2).set(w*scale,h*scale);}
}









