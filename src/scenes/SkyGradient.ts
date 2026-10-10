import * as T from 'three';
export const defaultSky=()=>({sky:'#b8dcf7',background:'#75b6db',transition:.55});
export type SkyPalette=ReturnType<typeof defaultSky>;
export class SkyGradient{
 readonly material:T.ShaderMaterial;
 readonly mesh:T.Mesh;
 /** 0..1 strength of the warm sunrise/sunset sky. */
 sunset=0;
 palette=defaultSky();private night=0;private hour=9;private sunsetSky=new T.Color('#a87eaa');private sunsetHorizon=new T.Color('#d28b65');readonly fogColor=new T.Color();
 constructor(scene:T.Scene){
  // Screen-space gradient above the horizon; rays pointing below it (steep views past the scenery and the mountain rim) resolve to fog color.
  this.material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{upper:{value:new T.Color()},lower:{value:new T.Color()},fog:{value:this.fogColor},transition:{value:.55}},vertexShader:'varying vec2 vUv;varying vec3 vDir;void main(){vUv=uv;vec4 r=inverse(projectionMatrix)*vec4(position.xy,1.,1.);vDir=transpose(mat3(viewMatrix))*(r.xyz/r.w);gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:'uniform vec3 upper,lower,fog;uniform float transition;varying vec2 vUv;varying vec3 vDir;float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}void main(){float t=smoothstep(transition-.45,transition+.45,vUv.y);float below=smoothstep(.06,-.08,normalize(vDir).y);gl_FragColor=vec4(mix(mix(lower,upper,t),fog,clamp(below,0.,1.)),1.);}'});
  this.mesh=new T.Mesh(new T.PlaneGeometry(2,2),this.material);this.mesh.name='sky-gradient';this.mesh.frustumCulled=false;this.mesh.renderOrder=-10000;this.mesh.layers.enable(1);scene.add(this.mesh);this.update(0);
 }
 set(p:SkyPalette){this.palette={...p};this.update(this.night,this.hour);}
 update(night:number,hour=9){this.night=night;this.hour=hour;// Sunrise uses the same warm sky as sunset, mirrored around its own peak.
  const glow=(start:number,peak:number,end:number)=>T.MathUtils.smoothstep(hour,start,peak)*(1-T.MathUtils.smoothstep(hour,peak,end));
  const sunset=Math.max(glow(16+40/60,17.8,18+50/60),glow(5,6+2/60,7+10/60));this.sunset=sunset;const brightness=1-night*.88;this.material.uniforms.upper.value.set(this.palette.sky).lerp(this.sunsetSky,sunset).multiplyScalar(brightness);this.material.uniforms.lower.value.set(this.palette.background).lerp(this.sunsetHorizon,sunset).multiplyScalar(brightness);this.material.uniforms.transition.value=this.palette.transition;this.fogColor.copy(this.material.uniforms.upper.value).lerp(this.material.uniforms.lower.value,.35);}
}




