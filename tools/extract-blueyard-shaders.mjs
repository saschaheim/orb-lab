#!/usr/bin/env node
/**
 * Inspect BlueYard's ORIGINAL WebGL shader programs, rather than inventing new materials.
 * Run locally: node tools/extract-blueyard-shaders.mjs
 * Requires: npm install --no-save playwright  (and installed Chromium)
 *
 * Output: webgl/original-shaders/*.glsl, webgl/original-shaders/manifest.json
 * The capture records compiled vertex/fragment shaders. It does not claim to
 * reconstruct the original JS scene graph, uniforms, scroll timelines or effects.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname || new URL('..',import.meta.url).pathname,'..');
const output=join(root,'webgl/original-shaders');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.ktx2':'image/ktx2','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const path=resolve(root,'.'+decodeURIComponent(url.pathname.replace(/^\/orb-lab\//,'/')));
    if(path!==root&&!path.startsWith(root+'/'))throw new Error('Outside repository');
    const bytes=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'});
    res.end(bytes);
  }catch(e){res.writeHead(404);res.end(String(e.message));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',req=>errors.push('FAILED '+req.url()));
await page.addInitScript(()=>{
  window.__blueyardShaderCapture=[];
  for(const k of ['WebGLRenderingContext','WebGL2RenderingContext']){
    const C=window[k];
    if(!C?.prototype?.shaderSource)continue;
    const old=C.prototype.shaderSource;
    C.prototype.shaderSource=function(shader,source){
      const type=this.getShaderParameter ? null : null;
      window.__blueyardShaderCapture.push({source:String(source),timestamp:performance.now(),api:k});
      return old.call(this,shader,source);
    };
  }
});
const scenes=['landing','computing','engineering','biology','crypto','team'];
try {
  await page.goto('http://127.0.0.1:'+port+'/orb-lab/blueyard-orbs.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(4000);
  for(const scene of scenes){
    await page.evaluate((name)=>{
      const el=document.querySelector('[data-webgl-section="'+name+'"]');
      const scroller=document.querySelector('.lenis');
      if(!el||!scroller)return;
      const box=el.getBoundingClientRect(),parent=scroller.getBoundingClientRect();
      scroller.scrollTo({top:scroller.scrollTop+box.top-parent.top+Math.min(box.height*.22,innerHeight*.6),behavior:'instant'});
      scroller.dispatchEvent(new Event('scroll',{bubbles:true}));
    },scene);
    await page.waitForTimeout(1800);
  }
  const captured=await page.evaluate(()=>window.__blueyardShaderCapture||[]);
  const unique=new Map();
  for(const entry of captured){
    const hash=createHash('sha256').update(entry.source).digest('hex');
    if(!unique.has(hash))unique.set(hash,{...entry,hash});
  }
  const shaders=[];
  let i=0;
  for(const entry of unique.values()){
    const ext=entry.source.includes('gl_Position')?'.vert.glsl':'.frag.glsl';
    const name=String(++i).padStart(3,'0')+'-'+entry.hash.slice(0,12)+ext;
    await writeFile(join(output,name),entry.source);
    shaders.push({file:name,sha256:entry.hash,bytes:Buffer.byteLength(entry.source),api:entry.api});
  }
  const report={capturedAt:new Date().toISOString(),source:'local blueyard-orbs.html + local _nuxt runtime',shaders,errors,notes:'Compiled GPU programs only. Uniforms, scene graph and original animation logic require further extraction.'};
  await writeFile(join(output,'manifest.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({shaderCount:shaders.length,errors:errors.slice(0,8),folder:output},null,2));
  if(!shaders.length)process.exitCode=1;
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
