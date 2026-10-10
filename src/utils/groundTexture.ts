import * as T from 'three';

// Local art trial: switch off to restore the original solid-color terrain.
export const GROUND_TEXTURE_TRIAL=true;
type Kind='grass'|'dirt';
const materials=new Map<string,T.MeshLambertMaterial>();
let atlas:T.Texture|undefined;
const terrainPixels=new Uint8Array(64*64*4);
const terrainPalette=new T.DataTexture(terrainPixels,64,64,T.RGBAFormat);
terrainPalette.magFilter=T.NearestFilter;terrainPalette.minFilter=T.NearestFilter;
export function resetGroundPalette(){terrainPixels.fill(0);terrainPalette.needsUpdate=true;}
export function groundTexture(mesh:T.Mesh,kind:Kind){
 if(!GROUND_TEXTURE_TRIAL||typeof document==='undefined')return mesh;
 if(!atlas){atlas=new T.TextureLoader().load(new URL('textures/ground-trial-v1.png',document.baseURI).href);atlas.colorSpace=T.SRGBColorSpace;atlas.magFilter=T.NearestFilter;atlas.minFilter=T.NearestMipmapNearestFilter;}
 const source=mesh.material as T.MeshLambertMaterial,key=`${source.uuid}:${kind}`;
 // Record the actual neighboring terrain, including the decorative outer ring.
 const minX=Math.round((mesh.position.x-mesh.scale.x/2+48)/1.5),minZ=Math.round((mesh.position.z-mesh.scale.z/2+48)/1.5);
 for(let x=minX;x<minX+Math.round(mesh.scale.x/1.5);x++)for(let z=minZ;z<minZ+Math.round(mesh.scale.z/1.5);z++){
  if(x<0||z<0||x>=64||z>=64)continue;const i=(z*64+x)*4;
  terrainPixels[i]=Math.round(source.color.r*255);terrainPixels[i+1]=Math.round(source.color.g*255);terrainPixels[i+2]=Math.round(source.color.b*255);terrainPixels[i+3]=kind==='grass'?100:200;
 }
 terrainPalette.needsUpdate=true;
 let material=materials.get(key);
 if(!material){material=source.clone();material.userData.groundKind=kind;configureGroundTexture(material);materials.set(key,material);}
 mesh.material=material;return mesh;
}
/** Reapply the hook to clones before attaching the surrounding terrain's fog hook. */
export function configureGroundTexture(material:T.MeshLambertMaterial){
 const kind=material.userData.groundKind as Kind|undefined;if(!kind||!atlas)return;
 material.onBeforeCompile=shader=>{
  shader.uniforms.groundAtlas={value:atlas};
  shader.uniforms.terrainPalette={value:terrainPalette};
  shader.vertexShader='varying vec3 groundPosition;varying float groundTop;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngroundPosition=(modelMatrix*vec4(position,1.)).xyz;groundTop=step(.5,normal.y);');
  shader.fragmentShader=`uniform sampler2D groundAtlas,terrainPalette;varying vec3 groundPosition;varying float groundTop;
   vec3 groundHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yxz+33.33);return fract((h.xxy+h.yzz)*h.zyx);}
   vec4 groundNeighbor(vec2 cell,vec4 fallback){vec4 c=texture2D(terrainPalette,(cell+.5)/64.);return c.a>.1?c:fallback;}
  `+shader.fragmentShader;
  // Painted ground: the neighbouring cells' colours blend across a smooth, noise-warped brush edge (no pixel snap,
  // no hard steps), so grass meets soil along an organic, hand-brushed line. The cell grid itself is unchanged.
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 mapPosition=(groundPosition.xz+48.)/1.5;
   vec4 original=texture2D(terrainPalette,(floor(mapPosition)+.5)/64.);
   vec3 gp=vec3(groundPosition.xz,0.).xzy;
   vec2 warp=vec2(pNoise(gp*1.3),pNoise(gp*1.3+11.))-.5;
   vec2 blendPosition=mapPosition-.5+warp*.55+(vec2(pNoise(gp*5.),pNoise(gp*5.+4.))-.5)*.12;
   vec2 baseCell=floor(blendPosition);
   vec2 blend=smoothstep(vec2(.3),vec2(.7),fract(blendPosition));
   vec4 a=groundNeighbor(baseCell,original),b=groundNeighbor(baseCell+vec2(1,0),original);
   vec4 c=groundNeighbor(baseCell+vec2(0,1),original),d=groundNeighbor(baseCell+vec2(1,1),original);
   vec4 terrain=mix(mix(a,b,blend.x),mix(c,d,blend.x),blend.y);
   float soilBlend=clamp((terrain.a-100./255.)/(100./255.),0.,1.);
   vec3 terrainColor=terrain.rgb*(1.+.3*soilBlend*(1.-soilBlend));
   if(original.a>.1)diffuseColor.rgb*=mix(vec3(1.),terrainColor/max(original.rgb,vec3(.02)),groundTop);
   // Only a very broad, low-contrast tone drift; the fine brush dabs were removed so the ground reads clean.
   float dab=pNoise(gp*.6);
   ${kind==='grass'?'diffuseColor.rgb*=mix(vec3(.97,.985,.99),vec3(1.03,1.02,.98),dab);':'diffuseColor.rgb*=mix(.98,1.02,dab);'}`);
 };
 material.customProgramCacheKey=()=>`ground-paint-v1-${kind}`;
}
