import {defaultGrade,cloneGrade,PHASES,type Grade,type Phase,type PhaseGrades} from '../scenes/ColorGradePass';
import {FIXED_GRADE} from '../data/colorGrade';

/* Colour lab: one full grade per time of day (day / dusk / night), edited live over the running game.
 * Picking a phase tab also jumps the clock to that phase, so you always see the grade you are editing; the game
 * blends the three grades as the day turns. Settings are saved on this device. */
const KEY='city-grading-phases-v1';
const PHASE_LABEL:Record<Phase,string>={day:'白天',dusk:'黄昏',night:'夜晚'};
// Index of the matching button in the time picker presets (自动, 清晨, 白天, 黄昏, 夜晚).
const PHASE_PRESET:Record<Phase,number>={day:2,dusk:3,night:4};
type Field=[keyof Grade,string,number,number,number];
const BASIC:Field[]=[['exposure','曝光 EV',-3,3,.05],['brightness','亮度',-.3,.3,.01],['contrast','对比度',.4,2,.01],['gamma','中间调 Gamma',.4,2.5,.01],['shadows','阴影',-1,1,.01],['highlights','高光',-1,1,.01]];
const COLOR:Field[]=[['saturation','饱和度',0,2,.01],['vibrance','自然饱和度',-1,1,.01],['temperature','色温（冷 → 暖）',-1,1,.01],['tint','色调（绿 → 洋红）',-1,1,.01]];
const SPLIT:Field[]=[['splitShadowHue','暗部色相',0,360,1],['splitShadowAmt','暗部强度',0,1,.01],['splitHighHue','亮部色相',0,360,1],['splitHighAmt','亮部强度',0,1,.01],['splitBalance','平衡（暗 ← → 亮）',-1,1,.01]];
const FX:Field[]=[['vignette','暗角',0,1,.01]];
const ALL=[...BASIC,...COLOR,...SPLIT,...FX];

/** Keep only valid, in-range values from a saved grade; anything else falls back to `base`. */
function sanitize(raw:unknown,base:Grade):Grade{
 const g=cloneGrade(base),s=raw as Partial<Grade>|null;if(!s||typeof s!=='object')return g;
 for(const [k,,min,max] of ALL){const v=s[k];if(typeof v==='number'&&Number.isFinite(v))(g[k] as number)=Math.min(max,Math.max(min,v));}
 if(Array.isArray(s.hsl)&&s.hsl.length===6)s.hsl.forEach((v,i)=>{if(Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))g.hsl[i]=v.map((n,j)=>Math.max(j?-1:-45,Math.min(j?1:45,n)));});
 if(s.curves)for(const k of ['master','red','green','blue'] as const){const p=s.curves[k];if(Array.isArray(p)&&p.length===5&&p.every(n=>Number.isFinite(n)))g.curves[k]=p.map(n=>Math.max(0,Math.min(1,n)));}
 return g;
}

export class ColorPanel{
 readonly timeSlot:HTMLElement;
 private panel:HTMLElement;private phase:Phase='day';private channel:keyof Grade['curves']='master';private band=0;private bypass=false;
 private bindings:(()=>void)[]=[];
 constructor(private grades:PhaseGrades,private apply:(override:Grade|null)=>void){
  const button=document.createElement('button');button.id='color-settings';button.textContent='◐ 调色';
  document.querySelector('.pause-panel .gfx-settings')!.append(button);
  this.panel=document.createElement('section');this.panel.id='color-panel';this.panel.hidden=true;
  const group=(id:string,title:string,open=false)=>`<details${open?' open':''}><summary>${title}</summary><div id="${id}"></div></details>`;
  this.panel.innerHTML=`<header><b>调色</b><button id="color-close">完成</button></header>
   <div class="phase-tabs" role="tablist" aria-label="编辑时段">${PHASES.map(p=>`<button role="tab" data-phase="${p}" aria-selected="false">${PHASE_LABEL[p]}</button>`).join('')}</div>
   <small>每个时段一套参数，游戏里随昼夜自动过渡。点时段会切到该时间，方便边看边调。</small>
   <div id="color-time"></div>
   ${group('grade-basic','曝光 / 影调',true)}${group('grade-color','色彩')}
   <details><summary>HSL 分色调整</summary><select id="grade-band" aria-label="HSL 色段">${['红','黄','绿','青','蓝','紫'].map((v,i)=>`<option value="${i}">${v}</option>`).join('')}</select><div id="grade-hsl"></div></details>
   ${group('grade-split','分离色调')}
   <details><summary>色调曲线</summary><select id="grade-channel" aria-label="曲线通道">${[['master','总曲线'],['red','红通道'],['green','绿通道'],['blue','蓝通道']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><svg id="grade-curve" viewBox="0 0 256 144" aria-label="拖动曲线控制点调整输出亮度"><path d="M8 136L248 8 M8 72H248 M128 8V136" stroke="#6d8c7b" fill="none"/><polyline fill="none" stroke="#ffe3a0" stroke-width="2"/>${[0,1,2,3,4].map(i=>`<circle data-point="${i}" r="5" fill="#ffe3a0"/>`).join('')}</svg><div id="grade-points"></div></details>
   ${group('grade-fx','效果')}
   <div class="grade-actions"><button id="grade-compare" aria-pressed="false">对比原图</button><button id="grade-copy-from">复制白天参数</button><button id="grade-reset">恢复默认</button><button id="grade-export">导出参数</button></div>
   <textarea id="grade-json" readonly aria-label="调色参数 JSON"></textarea><output id="grade-status" role="status"></output>`;
  document.getElementById('pause-menu')!.append(this.panel);
  this.timeSlot=this.panel.querySelector('#color-time')!;
  const cur=()=>this.grades[this.phase];
  for(const [id,fields] of [['grade-basic',BASIC],['grade-color',COLOR],['grade-split',SPLIT],['grade-fx',FX]] as [string,Field[]][])
   for(const [key,label,min,max,step] of fields)this.slider(id,key,label,min,max,step,()=>cur()[key] as number,v=>{(cur()[key] as number)=v;});
  for(const [i,label,min,max,step] of [[0,'色相',-45,45,1],[1,'饱和度',-1,1,.01],[2,'明度',-1,1,.01]] as [number,string,number,number,number][])this.slider('grade-hsl',`hsl-${i}`,label,min,max,step,()=>cur().hsl[this.band][i],v=>{cur().hsl[this.band][i]=v;});
  for(let i=0;i<5;i++)this.slider('grade-points',`point-${i}`,['黑场','暗部','中间调','亮部','白场'][i],0,1,.01,()=>cur().curves[this.channel][i],v=>{cur().curves[this.channel][i]=v;});

  const open=(value:boolean)=>{this.panel.hidden=!value;document.body.classList.toggle('color-editing',value);if(!value){this.bypass=false;this.changed();}};
  button.onclick=()=>{open(true);this.selectPhase(this.phase);document.getElementById('color-close')!.focus();};
  document.getElementById('color-close')!.onclick=()=>{open(false);button.focus();};
  this.panel.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach(tab=>tab.onclick=()=>this.selectPhase(tab.dataset.phase as Phase));
  document.getElementById('grade-band')!.onchange=e=>{this.band=Number((e.target as HTMLSelectElement).value);this.sync();};
  document.getElementById('grade-channel')!.onchange=e=>{this.channel=(e.target as HTMLSelectElement).value as typeof this.channel;this.sync();};
  document.getElementById('grade-compare')!.onclick=()=>{this.bypass=!this.bypass;this.changed();};
  document.getElementById('grade-reset')!.onclick=()=>{this.grades[this.phase]=cloneGrade(FIXED_GRADE);this.bypass=false;this.changed();this.status(`${PHASE_LABEL[this.phase]}已恢复默认`);};
  document.getElementById('grade-copy-from')!.onclick=()=>{if(this.phase==='day')return;this.grades[this.phase]=cloneGrade(this.grades.day);this.changed();this.status(`已把白天参数复制到${PHASE_LABEL[this.phase]}`);};
  document.getElementById('grade-export')!.onclick=async()=>{const area=document.getElementById('grade-json') as HTMLTextAreaElement;try{await navigator.clipboard.writeText(area.value);this.status('三个时段的参数已复制，粘贴到聊天即可');}catch{area.focus();area.select();this.status('请长按或全选复制下方参数');}};
  const svg=this.panel.querySelector('svg')!;let point=-1;
  const move=(e:PointerEvent)=>{if(point<0)return;const r=svg.getBoundingClientRect(),y=(e.clientY-r.top)/r.height*144;cur().curves[this.channel][point]=Math.round(Math.max(0,Math.min(1,(136-y)/128))*100)/100;this.changed();};
  svg.onpointerdown=e=>{const target=e.target as Element;if(!target.hasAttribute('data-point'))return;point=Number(target.getAttribute('data-point'));svg.setPointerCapture(e.pointerId);e.preventDefault();move(e);};svg.onpointermove=move;svg.onpointerup=svg.onpointercancel=()=>{point=-1;};
  new MutationObserver(()=>{if((document.getElementById('pause-menu') as HTMLElement).hidden&&!this.panel.hidden)open(false);}).observe(document.getElementById('pause-menu')!,{attributes:true,attributeFilter:['hidden']});
  try{const saved=JSON.parse(localStorage.getItem(KEY)??'null') as Partial<PhaseGrades>|null;if(saved)for(const p of PHASES)this.grades[p]=sanitize(saved[p],this.grades[p]);}catch{/* A damaged draft keeps the defaults. */}
  this.changed();
 }
 /** Edit this phase and jump the clock to it (through the time picker, so the choice is shown and saved there too). */
 private selectPhase(phase:Phase){
  this.phase=phase;
  this.timeSlot.querySelector<HTMLButtonElement>(`[data-preset="${PHASE_PRESET[phase]}"]`)?.click();
  (document.getElementById('grade-copy-from') as HTMLButtonElement).disabled=phase==='day';
  this.sync();
 }
 private status(text:string){document.getElementById('grade-status')!.textContent=text;}
 private slider(parent:string,id:string,label:string,min:number,max:number,step:number,get:()=>number,set:(v:number)=>void){
  const row=document.createElement('label');row.className='grade-row';row.innerHTML=`<span>${label}</span><input id="grade-${id}" type="range" min="${min}" max="${max}" step="${step}"><input type="number" aria-label="${label}数值" min="${min}" max="${max}" step="${step}">`;document.getElementById(parent)!.append(row);const [range,number]=Array.from(row.querySelectorAll('input'));
  const update=(v:string)=>{if(v.trim()===''||!Number.isFinite(Number(v)))return;set(Math.max(min,Math.min(max,Number(v))));this.changed();};range.oninput=()=>update(range.value);number.onchange=()=>update(number.value);this.bindings.push(()=>{range.value=number.value=String(Math.round(get()*1000)/1000);});
 }
 private changed(){try{localStorage.setItem(KEY,JSON.stringify(this.grades));}catch{}this.apply(this.bypass?defaultGrade():null);this.sync();}
 private sync(){
  this.bindings.forEach(f=>f());
  this.panel.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.phase===this.phase)));
  const points=this.grades[this.phase].curves[this.channel].map((v,i)=>`${8+i*60},${136-v*128}`);this.panel.querySelector('polyline')!.setAttribute('points',points.join(' '));this.panel.querySelectorAll('circle').forEach((c,i)=>{const [x,y]=points[i].split(',');c.setAttribute('cx',x);c.setAttribute('cy',y);});
  (document.getElementById('grade-json') as HTMLTextAreaElement).value=JSON.stringify(this.grades,null,1);
  const compare=document.getElementById('grade-compare')!;compare.textContent=this.bypass?'正在看原图 · 返回调色':'对比原图';compare.setAttribute('aria-pressed',String(this.bypass));
 }
}
