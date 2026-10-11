import './styles/style.css';
import {Game} from './game/Game';
const app=document.getElementById('app')!;
const loading=document.createElement('div');loading.className='loading';loading.textContent='正在为城市打下地基…';app.append(loading);
export let game:Game;
try{game=new Game(app);game.init().then(()=>loading.remove()).catch(showError);}catch(error){showError(error);}
// `?debug` exposes the game for performance profiling from the browser console.
if(new URLSearchParams(location.search).has('debug'))(window as unknown as {game:Game}).game=game!;
function showError(error:unknown){console.error(error);loading.className='loading error';loading.textContent=`启动失败：${String(error)}。请使用支持 WebGL2 的浏览器，并通过 npm run dev 启动。`;app.append(loading);}

