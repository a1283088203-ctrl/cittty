import * as T from 'three';

/* Hand-painted look, shared by every built-in material through global shader chunks (no per-material hooks, so the
 * existing onBeforeCompile hooks keep working unchanged):
 * - a world-space varying + value noise in `common`, written in `begin_vertex`;
 * - uneven "paint" in `color_fragment`: low-frequency lightness/warmth drift plus faint vertical brush streaks;
 * - soft wrap lighting in the Lambert BRDF, so light rolls round forms instead of cutting off at the terminator.
 * The blue-grey cast-shadow patch in CityScene is untouched: it still decides the colour of every shadow. */
export const NOISE_GLSL=`
float pHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float pNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(pHash(i),pHash(i+vec3(1,0,0)),f.x),mix(pHash(i+vec3(0,1,0)),pHash(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(pHash(i+vec3(0,0,1)),pHash(i+vec3(1,0,1)),f.x),mix(pHash(i+vec3(0,1,1)),pHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

let installed=false;
export function installPaintChunks(){
 if(installed)return;installed=true;
 const C=T.ShaderChunk;
 C.common+=`\nvarying vec3 vPaintWorld;\n${NOISE_GLSL}`;
 C.begin_vertex+=`\nvPaintWorld=(modelMatrix*vec4(transformed,1.)).xyz;`;
 C.color_fragment+=`
 {float broad=pNoise(vPaintWorld*1.1)*.6+pNoise(vPaintWorld*3.7+7.)*.4;
  // Only a gentle broad drift; the fine brush streaks were removed so surfaces read clean.
  diffuseColor.rgb*=1.+(broad-.5)*.06;
  // Warmer where the paint is thick, cooler where it is thin.
  diffuseColor.rgb*=mix(vec3(.97,.99,1.04),vec3(1.04,1.,.95),broad);}`;
 const lambert="float dotNL = saturate( dot( geometryNormal, directLight.direction ) );";
 C.lights_lambert_pars_fragment=C.lights_lambert_pars_fragment.replace(lambert,"float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + .22 ) / 1.22 );");
}
