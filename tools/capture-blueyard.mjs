#!/usr/bin/env node
// Orb Lab: capture the actual public BlueYard runtime for an authorized licensee.
// Requirements: npm install --no-save playwright && npx playwright install chromium
// Usage: node tools/capture-blueyard.mjs
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

const root=resolve('blueyard-capture');
const rows=[],errors=[],tasks=new Set(),seen=new Set();
const hash=x=>createHash('sha256').update(x).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(root,{recursive:true});

const browser=await chromium.launch({headless:process.argv.includes('--headless'),args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
await context.addInitScript(()=>{
  window.__orbLabShaders=[];
  for(const type of ['WebGLRenderingContext','WebGL2RenderingContext']){
    const C=window[type];if(!C)continue;
    const p=C.prototype,o=p.shaderSource;if(typeof o!=='function')continue;
    p.shaderSource=function(shader,glsl){
      try{const type=this.getShaderParameter(shader,this.SHADER_TYPE);
        window.__orbLabShaders.push({type:type===this.VERTEX_SHADER?'vertex':type===this.FRAGMENT_SHADER?'fragment':type,source:String(glsl)});}
      catch(_){}
      return o.call(this,shader,glsl);
    };
  }
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push({kind:'pageerror',message:String(e)}));
page.on('requestfailed',r=>errors.push({kind:'requestfailed',url:r.url(),message:r.failure()?.errorText}));
context.on('response',response=>{
  const job=(async()=>{
    try{
      const url=response.url(),u=new URL(url),status=response.status();
      if(!/^https?:$/.test(u.protocol)||status<200||status>=400)return;
      if(/google-analytics|doubleclick|hotjar|clarity.ms/i.test(url))return;
      if(Number(response.headers()['content-length']||0)>40000000)return;
      const data=await response.body();
      if(!data.length||data.length>40000000)return;
      const ct=response.headers()['content-type']||'';
      const parts=u.pathname.split('/').filter(x=>x&&x!=='.'&&x!=='..').map(x=>x.replace(/[^-_.a-zA-Z0-9]/g,'_'));
      let name=parts.pop()||'index.html';
      if(!name.includes('.')&&ct.includes('javascript'))name+='.js';
      if(!name.includes('.')&&ct.includes('css'))name+='.css';
      const h=hash(url).slice(0,12);
      name=name.slice(0,115)+'__'+h;
      const dest=join(root,'resources',u.hostname,...parts,name);
      if(seen.has(dest))return;seen.add(dest);
      await mkdir(dirname(dest),{recursive:true});
      await writeFile(dest,data);
      rows.push({url,path:relative(root,dest),size:data.length,contentType:ct,sha256:hash(data)});
      if(ct.includes('javascript')||/\.m?js($|\?)/.test(url))console.log('JS',data.length,'bytes',url);
    }catch(e){errors.push({kind:'capture',url:response.url(),message:String(e)});}
  })();
  tasks.add(job);job.finally(()=>tasks.delete(job));
});

console.log('Opening https://blueyard.com/');
await page.goto('https://blueyard.com/',{waitUntil:'domcontentloaded',timeout:60000});
await delay(5000);
await page.screenshot({path:join(root,'start.png'),timeout:20000}).catch(e=>errors.push({kind:'screenshot',message:String(e)}));
for(let i=0;i<12;i++){
  await page.mouse.move(240+(i%4)*270,280+(i%3)*90,{steps:16});
  await page.mouse.wheel(0,520);await delay(1000);
}
await delay(2500);
await Promise.allSettled([...tasks]);
const shaders=await page.evaluate(()=>window.__orbLabShaders||[]);
await writeFile(join(root,'shaders.json'),JSON.stringify(shaders,null,2));
await writeFile(join(root,'rendered-dom.html'),await page.content());
await writeFile(join(root,'manifest.json'),JSON.stringify({source:'https://blueyard.com/',capturedAt:new Date().toISOString(),resources:rows,errors},null,2));
await browser.close();
execFileSync('tar',['-czf',resolve('blueyard-capture.tar.gz'),'-C',dirname(root),'blueyard-capture']);
console.log('Complete:',rows.length,'resources,',shaders.length,'WebGL shaders.');
console.log('Archive:',resolve('blueyard-capture.tar.gz'));
