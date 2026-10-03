// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module and a local server on :8765.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {buildJevRequest} from '../shared/prompts.js';
import {checkBatch} from '../shared/telemetry.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const screenshots=process.env.SCREENSHOT_DIR || 'test-artifacts';mkdirSync(screenshots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],requests=[],logs=[];
page.on('pageerror',e=>errors.push(e.stack));
await page.route('**/*.workers.dev/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 let data={};try{data=req.postDataJSON()||{};}catch{}
 if(url.pathname==='/assignment')return route.fulfill({json:{id:'12345678-abcd-1234-abcd-123456789012',game:data.game,experiment:'2',opponent:'jev',mode:'raw',variant:'generalization',policy:'greedy',source:'adaptive',expires:Date.now()+3600000}});
 if(url.pathname==='/decide') {
  try {const p=buildJevRequest(data.game,data.payload,data.mode,data.variant);requests.push(data);return route.fulfill({json:{model:'typesafe/jev',answers:Object.fromEntries(Object.entries(p.questions).map(([k,q])=>[k,q.type==='noul'?{type:'noul',noul:.5}:{type:'choice',choice:Object.keys(q.criteria)[0],probabilities:Object.fromEntries(Object.keys(q.criteria).map((x,i,keys)=>[x,1/keys.length]))}]))}});}
  catch(e){errors.push(e.stack);return route.fulfill({status:400,json:{error:'bad_request'}});}
 }
 if(url.pathname==='/log'){try{checkBatch(data);logs.push(data);}catch(e){errors.push(e.stack);}return route.fulfill({json:{ok:true}});}
 if(url.pathname==='/stats')return route.fulfill({json:{enabled:true,cols:[],rows:[],matches:[],modern:[],updated:new Date().toISOString()}});
 return route.fulfill({json:{}});
});
for(const game of ['pd','rps','ultimatum','blotto','liarsdice','holdem']) {
 await page.goto(`http://localhost:8765/#/play/${game}`);
 await page.waitForSelector('.rule-dialog');
 await page.screenshot({path:`${screenshots}/${game}-rules.png`});
 await page.locator('.rule-confirm').click();
 await page.waitForSelector('.board button');
 console.log(game,(await page.locator('.board').innerText()).slice(0,500).replaceAll('\n',' | '));
 const actions=await page.locator('.board button').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>e.innerText));console.log('buttons',actions);
 await page.screenshot({path:`${screenshots}/${game}.png`});
}
for(const width of [1280,320,375,430]) {
 await page.setViewportSize({width,height:900});
 await page.goto('http://localhost:8765/#/insights');await page.waitForSelector('.ins-filter-bar');
 for(const compare of [false,true]) {
  if(compare)await page.getByRole('button',{name:'Compare',exact:true}).click();
  const boxes=await page.locator('.ins-filter-bar button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));
  for(const b of boxes){assert.ok(b.left>=0 && b.right<=width,`Filter overflow at ${width}px`);if(width<=640)assert.ok(b.height>=44,'Mobile touch targets must be at least 44px');}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
  if(compare)assert.equal(await page.locator('.ins-version-fixed').count(),1);
  await page.screenshot({path:`${screenshots}/insights-${width}-${compare?'compare':'overview'}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Standard',exact:true}).click();
}
console.log('errors',errors,'requests',requests.length,'logs',logs.length);
await browser.close();if(errors.length)process.exitCode=1;
