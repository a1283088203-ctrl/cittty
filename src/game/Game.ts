

import * as T from 'three';
import {CityScene} from '../scenes/CityScene';
import {CameraController} from '../camera/CameraController';
import {PhysicsSystem} from '../systems/PhysicsSystem';
import {BuildingSystem} from '../systems/BuildingSystem';
import {MergeSystem} from '../systems/MergeSystem';
import {RoadSystem} from '../systems/RoadSystem';
import {PathfindingSystem} from '../systems/PathfindingSystem';
import {NPCSystem} from '../systems/NPCSystem';
import {VehicleSystem} from '../systems/VehicleSystem';
import {DecorationSystem} from '../systems/DecorationSystem';
import {ProgressionSystem} from '../systems/ProgressionSystem';
import {PopulationSystem} from '../systems/PopulationSystem';

import {EffectsSystem} from '../systems/EffectsSystem';
import {UIManager} from '../systems/UIManager';
import {WindSystem} from '../systems/WindSystem';
import {TerrainSystem} from '../systems/TerrainSystem';
import {TimeOfDaySystem} from '../systems/TimeOfDaySystem';
import {SoundSystem} from '../systems/SoundSystem';
import {ScoreSystem} from '../systems/ScoreSystem';
import {DemolitionSystem} from '../systems/DemolitionSystem';
import {TouchInputSystem} from '../systems/TouchInputSystem';
import {ForegroundClouds} from '../systems/ForegroundClouds';
import {mountTimePickers} from '../systems/TimePicker';
import {buildingModel} from '../entities/Building';
import {randomBuildingVariant} from '../entities/BuildingDecorations';
import {buildingData,MAX_LEVEL} from '../data/buildings';
import {CITY} from '../data/cityConfig';
import {BuildingQueue} from '../data/progression';
import {clamp} from '../utils/math';
export class Game{
 city:CityScene;camera:CameraController;physics=new PhysicsSystem();buildings:BuildingSystem;merge:MergeSystem;paths=new PathfindingSystem();roads:RoadSystem;npcs:NPCSystem;vehicles:VehicleSystem;decorations:DecorationSystem;progress=new ProgressionSystem();population=new PopulationSystem();effects:EffectsSystem;ui:UIManager;wind:WindSystem;terrain:TerrainSystem;time=new TimeOfDaySystem();sound=new SoundSystem();score=new ScoreSystem();
 demolition:DemolitionSystem;private paused=false;private missileMode=false;
 private touch?:TouchInputSystem;private foregroundClouds:ForegroundClouds;private refreshTimePickers=()=>{};
 private buildingQueue=new BuildingQueue();private currentVariant=0;private nextVariant=0;
 private ghost!:T.Group;private marker:T.Mesh;private current=1;private next=1;private yaw=0;private x=0;private z=0;private dropY=5;private cooldown=0;private elapsed=0;private accumulator=0;private roadTimer=0;private warning=0;private over=false;private last=0;private pointerDown:{x:number;y:number}|null=null;private dragDistance=0;private keyboardAim=false;private lastHoverX=0;private lastHoverY=0;
 constructor(parent:HTMLElement){this.city=new CityScene(parent);this.foregroundClouds=new ForegroundClouds(parent);this.camera=new CameraController(this.city.renderer.domElement);this.city.enablePostProcessing(this.camera.camera,this.camera.controls.target);this.buildings=new BuildingSystem(this.city.scene,this.physics);this.roads=new RoadSystem(this.city.scene,this.paths);this.npcs=new NPCSystem(this.city.scene,this.roads,this.paths);this.vehicles=new VehicleSystem(this.city.scene,this.roads,this.paths,true);this.decorations=new DecorationSystem(this.city.scene);this.effects=new EffectsSystem(this.city.scene);this.ui=new UIManager(parent);this.wind=new WindSystem(this.city.scene);this.terrain=new TerrainSystem(this.city.scene);this.roads.terrain=this.terrain;this.wind.onChange=state=>{if(state==='STRONG_WIND'){this.ui.notify('STRONG WIND! · 高处建筑请注意稳固');this.sound.warning();}};
 this.merge=new MergeSystem(this.buildings,(level,p)=>{this.progress.update(level);this.effects.burst(p);this.sound.merge(level);this.camera.pulse();this.ui.notify(level===MAX_LEVEL?'UTOPIA COMPLETED · CAPACITY +100,000':`${level<5?'MERGED':'HOUSING OPTIMIZED'} · ${buildingData(level).label} · ${buildingData(level).population.toLocaleString()} RESIDENTS`);if(level===MAX_LEVEL)this.camera.expand();});
 this.buildings.onCollapse=b=>{this.effects.collapse(b);this.sound.collapse();this.camera.pulse();this.roadTimer=1;};
 this.demolition=new DemolitionSystem(this.city.scene,this.buildings,this.terrain,b=>{this.effects.collapse(b);this.effects.burst(b.mesh.position.clone());this.sound.collapse();this.camera.pulse();this.roadTimer=1;this.ui.notify("DEMOLISHED! · 已拆除");},p=>{this.effects.burst(p);this.sound.collapse();this.camera.pulse();this.ui.notify('岩石已清除 · 地块解锁');});
 this.buildings.onImpact=(_b,speed)=>this.sound.impact(speed);
 this.marker=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:0xf9e7b0,transparent:true,opacity:.65,side:T.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.marker.position.y=.15;this.city.scene.add(this.marker);
 }
 async init(){await this.physics.init();this.ui.bind(()=>this.drop(),()=>this.rotate(1),()=>this.restart());this.ui.bindTools(()=>this.setPaused(!this.paused),()=>this.setPaused(false),()=>this.toggleMissile());this.bindInput();document.addEventListener('pointerdown',()=>void this.sound.unlock(),{capture:true});document.addEventListener('keydown',()=>void this.sound.unlock(),{capture:true});const soundButton=document.getElementById('sound')!;const soundLabel=()=>{soundButton.textContent=this.sound.enabled?'♪ 音效 开':'♪ 音效 关';soundButton.setAttribute('aria-pressed',String(this.sound.enabled));};soundLabel();soundButton.addEventListener('click',()=>{this.sound.toggle();soundLabel();});
 const crtButton=document.getElementById('crt')!;let crtOn=false;try{crtOn=localStorage.getItem('stack-city-crt')==='on';}catch{}
 const crtLabel=()=>{crtButton.textContent=crtOn?'▦ CRT 滤镜 开':'▦ CRT 滤镜 关';crtButton.setAttribute('aria-pressed',String(crtOn));};this.city.setCrt(crtOn);crtLabel();
 crtButton.addEventListener('click',()=>{crtOn=!crtOn;try{localStorage.setItem('stack-city-crt',crtOn?'on':'off');}catch{}this.city.setCrt(crtOn);crtLabel();});
 const bloomSlider=document.getElementById('bloom') as HTMLInputElement,bloomValue=document.getElementById('bloom-value')!;
 let bloomPct=100;try{bloomPct=Math.min(160,Math.max(0,Number(localStorage.getItem('stack-city-bloom'))||100));}catch{}
 bloomSlider.value=String(bloomPct);bloomValue.textContent=`${bloomPct}%`;this.city.bloomScale=bloomPct/100;
 bloomSlider.addEventListener('input',()=>{const v=Number(bloomSlider.value);bloomValue.textContent=`${v}%`;this.city.bloomScale=v/100;try{localStorage.setItem('stack-city-bloom',String(v));}catch{}});
 // Day-phase switch in the graphics settings (auto / dawn / day / dusk / night + hour slider); lighting re-applies at
 // once, even while paused.
 this.refreshTimePickers=mountTimePickers(this.time,[document.querySelector<HTMLElement>('.pause-panel .gfx-settings')!],()=>this.city.applyLighting(this.time,0));
 this.restart();this.resize();window.addEventListener('resize',()=>this.resize());window.visualViewport?.addEventListener('resize',()=>this.resize());window.visualViewport?.addEventListener('scroll',()=>this.resize());document.addEventListener('visibilitychange',()=>{this.last=0;this.accumulator=0;});requestAnimationFrame(this.frame);}
 private restart(){this.setPaused(false);this.missileMode=false;this.demolition.reset();this.ui.tool(false,0);this.touch?.reset();this.ui.resetScore();this.sound.restart();this.buildings.clear();this.physics.reset();this.merge.reset();this.effects.clear();this.wind.reset();this.time.reset();this.terrain.generate();this.city.mountains.rerollClouds();this.roads.reset();this.npcs.reset();this.vehicles.reset();this.decorations.reset();this.progress.reset();this.buildings.era=0;this.camera.reset();this.buildingQueue.reset();this.current=this.rollNext();this.next=this.rollNext();this.currentVariant=randomBuildingVariant();this.nextVariant=randomBuildingVariant();this.yaw=0;this.x=0;this.z=0;this.cooldown=0;this.warning=0;this.over=false;this.accumulator=0;this.ui.end(false);this.ui.warning(0);
 // Three modest households make the initial district alive while leaving the center open.
 const occupied:{x:number;z:number}[]=[];for(const level of [1,1,2]){const d=buildingData(level),plot=this.terrain.findPlot(d.width,d.depth,occupied);if(plot){occupied.push(plot);const b=this.buildings.spawn(level,plot.x,d.height/2+.05,plot.z);b.age=1;}}const initial=buildingData(this.current),start=this.terrain.findPlot(initial.width,initial.depth,occupied);if(start){this.x=start.x;this.z=start.z;}
 this.roads.rebuild(this.buildings.buildings,true);this.preview();this.ui.notify('WELCOME HOME · 将同级建筑叠在一起，等待合成');}
 private preview(){if(this.ghost){this.ghost.traverse(o=>{if(o instanceof T.Mesh)(o.material as T.Material).dispose();});this.ghost.removeFromParent();}this.ghost=buildingModel(buildingData(this.current),true,this.progress.index,this.currentVariant);this.city.scene.add(this.ghost);this.ui.queue(this.current,this.next);this.positionPreview();}
 private setPaused(value:boolean){this.paused=value;if(value)this.refreshTimePickers();this.touch?.reset();this.pointerDown=null;this.accumulator=0;this.last=0;this.camera.controls.enabled=!value;this.ui.pause(value);this.sound.update(0,0);}
 private toggleMissile(){if(this.paused||this.over||this.demolition.cooldown>0)return;this.touch?.reset();this.missileMode=!this.missileMode;this.ui.tool(this.missileMode,this.demolition.cooldown);this.positionPreview();}
 private positionPreview(){
 if(this.missileMode){this.x=clamp(this.x,-CITY.half,CITY.half);this.z=clamp(this.z,-CITY.half,CITY.half);const target=this.demolition.aim(this.x,this.z);this.demolition.preview.visible=!this.over;this.ghost.visible=false;this.marker.visible=!this.over;this.marker.position.set(this.x,.16,this.z);const markW=target?target.kind==='building'?target.building.data.width:1.1:1,markD=target?target.kind==='building'?target.building.data.depth:1.1:1;this.marker.scale.set(markW,markD,1);(this.marker.material as T.MeshBasicMaterial).color.setHex(target?0xffaa66:0xe56666);return;}
 this.demolition.preview.visible=false;const d=buildingData(this.current),turned=Math.abs(Math.sin(this.yaw))>.5,w=turned?d.depth:d.width,depth=turned?d.width:d.depth;this.x=clamp(this.x,-CITY.half+w/2+.2,CITY.half-w/2-.2);this.z=clamp(this.z,-CITY.half+depth/2+.2,CITY.half-depth/2-.2);
 let top=0;for(const b of this.buildings.buildings){const bb=b.bounds;if(bb.max.x>this.x-w/2&&bb.min.x<this.x+w/2&&bb.max.z>this.z-depth/2&&bb.min.z<this.z+depth/2)top=Math.max(top,bb.max.y);}
 this.dropY=Math.min(42,top+d.height/2+4);this.ghost.position.set(this.x,this.dropY+Math.sin(this.elapsed*2)*.06,this.z);this.ghost.rotation.y=this.yaw;this.marker.position.set(this.x,.15,this.z);this.marker.scale.set(w,depth,1);this.ghost.visible=!this.over;this.marker.visible=!this.over;(this.marker.material as T.MeshBasicMaterial).color.setHex(this.terrain.canPlace(this.x,this.z,d.width,d.depth,this.yaw)?0xf9e7b0:0xe56666);
 }
 private drop(){if(this.paused||this.over)return;if(this.missileMode){if(this.demolition.launch(this.x,this.z)){this.sound.drop();this.missileMode=false;this.ui.tool(false,this.demolition.cooldown);this.positionPreview();}else{this.sound.invalid();this.ui.notify('将导弹对准住宅或岩石');}return;}if(this.cooldown>0)return;if(this.buildings.buildings.length>=CITY.maxBuildings){this.ui.notify('地块已满 · 通过合成释放空间');return;}this.positionPreview();const data=buildingData(this.current);if(!this.terrain.canPlace(this.x,this.z,data.width,data.depth,this.yaw)){this.ui.notify('此处不可建设 · 请避开河流与岩石');this.sound.invalid();return;}this.buildings.spawn(this.current,this.x,this.dropY,this.z,this.yaw,true,this.currentVariant);this.sound.drop();this.current=this.next;this.currentVariant=this.nextVariant;this.nextVariant=randomBuildingVariant();this.next=this.rollNext();this.cooldown=.7;this.preview();}
 private rollNext(){return this.buildingQueue.roll(this.progress.stage.queueLevel,this.progress.maxLevel);}
 private rotate(direction:number){if(this.paused||this.missileMode)return;this.sound.tick();this.yaw+=direction*Math.PI/2;this.positionPreview();}
 private bindInput(){const canvas=this.city.renderer.domElement,ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();
 canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(e.button===0){this.pointerDown={x:e.clientX,y:e.clientY};this.dragDistance=0;}});
 canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;if(this.pointerDown)this.dragDistance=Math.max(this.dragDistance,Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y));if(e.buttons)return;if(this.keyboardAim&&Math.hypot(e.clientX-this.lastHoverX,e.clientY-this.lastHoverY)<6)return;this.keyboardAim=false;this.lastHoverX=e.clientX;this.lastHoverY=e.clientY;const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera.camera);if(ray.ray.intersectPlane(plane,hit)){this.x=Math.round(hit.x*2)/2;this.z=Math.round(hit.z*2)/2;}});
 canvas.addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;if(e.button===0&&this.pointerDown&&this.dragDistance<5)this.drop();this.pointerDown=null;});canvas.addEventListener('pointercancel',()=>this.pointerDown=null);canvas.addEventListener('contextmenu',e=>{e.preventDefault();if((e as PointerEvent).pointerType!=='touch')this.rotate(1);});
 this.touch=new TouchInputSystem(canvas,document.getElementById('drop')!,{
  drop:()=>this.drop(),
  aim:(x,y)=>{const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera.camera);if(ray.ray.intersectPlane(plane,hit)){this.x=Math.round(hit.x*2)/2;this.z=Math.round(hit.z*2)/2;this.positionPreview();}},
  move:(dx,dy)=>{const right=new T.Vector3().setFromMatrixColumn(this.camera.camera.matrixWorld,0);right.y=0;right.normalize();const forward=new T.Vector3(-right.z,0,right.x);this.x+=(right.x*dx+forward.x*dy)*.035;this.z+=(right.z*dx+forward.z*dy)*.035;this.positionPreview();}
 });
 window.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();if(!e.repeat)this.setPaused(!this.paused);return;}if(this.paused)return;const moveKey=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(e.code);if(e.target instanceof HTMLButtonElement){if(moveKey)e.target.blur();else return;}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();switch(e.code){case 'Space':if(e.repeat)return;this.drop();break;case 'KeyQ':if(e.repeat)return;this.rotate(-1);break;case 'KeyE':if(e.repeat)return;this.rotate(1);break;case 'ArrowLeft':case 'KeyA':this.keyboardAim=true;this.x-=.5;break;case 'ArrowRight':case 'KeyD':this.keyboardAim=true;this.x+=.5;break;case 'ArrowUp':case 'KeyW':this.keyboardAim=true;this.z-=.5;break;case 'ArrowDown':case 'KeyS':this.keyboardAim=true;this.z+=.5;}});
 }
 private viewportWidth=0;private viewportHeight=0;
 private resize(){
  const view=window.visualViewport,scale=view?.scale??1;
  // Cancel browser page magnification for the game surface, not camera zoom.
  const w=Math.max(1,Math.round((view?.width??innerWidth)*scale)),h=Math.max(1,Math.round((view?.height??innerHeight)*scale));
  const style=document.documentElement.style;
  style.setProperty('--game-width',`${w}px`);style.setProperty('--game-height',`${h}px`);
  style.setProperty('--game-left',`${view?.offsetLeft??0}px`);style.setProperty('--game-top',`${view?.offsetTop??0}px`);style.setProperty('--game-scale',`${1/scale}`);
  if(w!==this.viewportWidth||h!==this.viewportHeight){this.viewportWidth=w;this.viewportHeight=h;this.city.resize(w,h);this.camera.resize(w,h);this.foregroundClouds.resize(w,h);}
 }
 private frame=(now:number)=>{const dt=this.last?Math.min((now-this.last)/1000,.1):0;this.last=now;if(this.paused){
 // Lighting and foreground clouds keep easing while paused (clouds finish sliding in or out).
 this.city.applyLighting(this.time,0);this.foregroundClouds.update(dt,this.camera.camera.position.distanceTo(this.camera.controls.target),this.camera.controls.maxDistance,this.city.skyGradient.fogColor,this.time.night,this.city.skyGradient.sunset);
 this.city.render(this.camera.camera);requestAnimationFrame(this.frame);return;}this.demolition.update(dt);this.ui.tool(this.missileMode,this.demolition.cooldown);this.elapsed+=dt;this.cooldown-=dt;this.accumulator+=dt;
 while(this.accumulator>=CITY.step){this.wind.step(CITY.step,this.buildings.buildings,this.time.night);this.physics.step();this.buildings.update(CITY.step);if(!this.over)this.merge.update(CITY.step);this.accumulator-=CITY.step;}
 this.time.update(dt);this.city.applyLighting(this.time,dt);this.population.update(this.buildings.buildings);if(this.progress.update(this.progress.maxLevel,this.population.population)){this.ui.notify(`${this.progress.stage.name} UNLOCKED!`);this.sound.upgrade();}this.city.setStage(this.progress.index);this.buildings.era=this.progress.index;this.roadTimer+=dt;if(this.roadTimer>.8){this.roadTimer=0;this.roads.rebuild(this.buildings.buildings,false,this.progress.index);}
 this.decorations.update(this.roads,this.progress.index,this.progress.stage.green,dt);this.decorations.updateArchitecture(this.buildings.buildings,this.progress.index);this.city.setStreetLights(this.decorations.lampPositions,this.time.night);this.city.setBuildingLights(this.buildings.buildings,this.camera.controls.target,this.time.night);this.npcs.update(dt,this.population.population,this.progress.index,this.time.activity(this.progress.index));this.vehicles.update(dt,this.population.population,this.progress.index,Math.max(.3,this.time.activity(this.progress.index)));this.effects.update(dt);this.wind.updateVisuals(dt);this.decorations.updateWind(this.elapsed,this.wind);this.terrain.update(dt,Math.max(this.progress.maxLevel,...this.buildings.buildings.map(b=>b.level)));this.ui.wind(this.wind);this.ui.time(this.time);this.positionPreview();
 const unsafe=this.buildings.buildings.some(b=>b.age>2&&b.bounds.max.y>CITY.safetyHeight);this.warning=unsafe?this.warning+dt:Math.max(0,this.warning-dt*2);this.ui.warning(this.warning);this.sound.update(this.wind.strength,this.warning);if(this.warning>CITY.warningSeconds&&!this.over){this.over=true;this.ui.end(true);}
 this.score.update(this.buildings.buildings,this.roads);this.ui.score(this.score);this.ui.update(dt,this.progress,this.merge.count);this.camera.update(dt);this.foregroundClouds.update(dt,this.camera.camera.position.distanceTo(this.camera.controls.target),this.camera.controls.maxDistance,this.city.skyGradient.fogColor,this.time.night,this.city.skyGradient.sunset);this.city.render(this.camera.camera);requestAnimationFrame(this.frame);
 };
}





















