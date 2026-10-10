import type {TimeOfDaySystem} from './TimeOfDaySystem';
const PRESETS:[string,number|null][]=[['自动',null],['清晨',6+2/60],['白天',12],['黄昏',17.8],['夜晚',22]];
const KEY='stack-city-time-lock';
/** Day-phase switcher: lock the clock to a preset or any hour, or let it run. Mounted in the graphics settings and the
 * colour panel; every copy stays in sync. The choice is saved on this device. Returns a refresh for the running clock. */
export function mountTimePickers(time:TimeOfDaySystem,parents:HTMLElement[],onChange:()=>void){
 try{const saved=localStorage.getItem(KEY);if(saved){const hour=Number(saved);if(Number.isFinite(hour)&&hour>=0&&hour<24)time.setLock(hour);}}catch{}
 const syncs:(()=>void)[]=[],refresh=()=>syncs.forEach(f=>f());
 const set=(hour:number|null)=>{time.setLock(hour);try{localStorage.setItem(KEY,hour===null?'':String(hour));}catch{}refresh();onChange();};
 for(const parent of parents){
  const box=document.createElement('div');box.className='time-picker';
  box.innerHTML=`<div class="time-presets" role="group" aria-label="时段">${PRESETS.map(([label],i)=>`<button type="button" data-preset="${i}" aria-pressed="false">${label}</button>`).join('')}</div><label class="bloom-row">时刻 <input type="range" min="0" max="23.95" step="0.05" aria-label="锁定时刻"><b></b></label>`;
  parent.append(box);
  const buttons=Array.from(box.querySelectorAll<HTMLButtonElement>('[data-preset]')),range=box.querySelector('input')!,label=box.querySelector('b')!;
  buttons.forEach((button,i)=>button.onclick=()=>set(PRESETS[i][1]));
  range.oninput=()=>set(Number(range.value));
  syncs.push(()=>{
   buttons.forEach((button,i)=>{const hour=PRESETS[i][1];button.setAttribute('aria-pressed',String(hour===null?time.locked===null:time.locked!==null&&Math.abs(time.locked-hour)<.01));});
   range.value=String(time.hour);label.textContent=time.locked===null?`${time.clock} ▸`:time.clock;
  });
 }
 refresh();return refresh;
}
