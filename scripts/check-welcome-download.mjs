// Synthetic browser documents with installed Foundry hyperlink code and real module handlers.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(repo,'../artifacts/dmicher-generics/1.0.0/welcome-download-preview');fs.mkdirSync(output,{recursive:true});
const { chromium }=createRequire(import.meta.url)(path.join(process.env.CODEX_NODE_MODULES??path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright'));
const server=http.createServer((request,response)=>{
  const route=decodeURIComponent((request.url??'/').split('?')[0]);
  if(route==='/')return response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><body class="game theme-dark"><button id="export">Export JSON</button></body>');
  let file;
  if(route.startsWith('/module/')) {const root=path.join(repo,'dmicher-generics');const target=path.resolve(root,route.slice(8));if(target.startsWith(root+path.sep))file=target;}
  else if(/^\/core\/(13.351|14.366)\.css$/.test(route))file=`E:/Foundry Portable/Foundry VTT ${route.slice(6,-4)}/App/resources/app/public/css/foundry2.css`;
  if(!file||!fs.existsSync(file))return response.writeHead(404).end();
  response.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream'});fs.createReadStream(file).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report=[];
try {
  for(const version of ['13.351','14.366']) {
    const page=await browser.newPage({viewport:{width:900,height:850},acceptDownloads:true});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const core=fs.readFileSync(`E:/Foundry Portable/Foundry VTT ${version}/App/resources/app/client/game.mjs`,'utf8');
    const start=core.indexOf('  _onClickHyperlink(event) {'),end=core.indexOf('\n  }',start)+4;
    assert.ok(start>0&&end>start);const method=core.slice(start,end);
    const before=await page.evaluate(async method=>{
      window.intercepted=[];window.open=url=>window.intercepted.push(url);
      const handler=new Function(`return ({${method}})._onClickHyperlink`)();document.addEventListener('click',handler);
      const blob=new Blob(['{"before":true}'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='before.json';document.body.append(link);link.click();link.remove();
      const intercepted=window.intercepted.length;URL.revokeObjectURL(url);
      const {createJSONTransfer}=await import('/module/scripts/components.js');
      window.blobTypes=[];const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blobTypes.push(blob.type);return create(blob);};
      window.transfer=createJSONTransfer({filename:'scene-export',exportValue:()=>({name:'Market',count:2}),validate:value=>value,importValue:()=>{}});
      document.querySelector('#export').addEventListener('click',()=>transfer.export());
      return intercepted;
    },method);
    assert.equal(before,1,'The actual Foundry hyperlink handler intercepts the old attached download anchor');
    const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),'scene-export.json');const downloadPath=path.join(output,`${version}-${download.suggestedFilename()}`);await download.saveAs(downloadPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(downloadPath,'utf8')),{name:'Market',count:2});
    assert.deepEqual(await page.evaluate(()=>blobTypes),['application/json']);assert.equal(await page.evaluate(()=>intercepted.length),1);
    report.push({version,test:'Actual JSON download retains application/json and .json filename under Foundry hyperlink interception',passed:true});
    await page.addStyleTag({url:`/core/${version}.css`});
    for(const file of ['components','help'])await page.addStyleTag({url:`/module/styles/${file}.css`});
    await page.addStyleTag({content:'body{padding:20px;background:#303438;overflow:auto}.message{position:relative;width:590px;background:#eee;color:#222;padding:14px}.message-sender .avatar img{width:40px;height:40px}.dmicher-setting-help i::before{content:"?"}'});
    for(const language of ['en','ru'])for(const gm of [false,true]) {
      await page.evaluate(async ({language,gm})=>{
        const {createWelcomeController}=await import('/module/scripts/welcome.js'),help=await import('/module/scripts/help/index.js');
        window.calls=[];window.hooks=new Map();window.Hooks={on:(name,fn)=>(hooks.set(name,fn),fn),off:()=>{}};
        const user={id:gm?'gm':'player',role:gm?4:1},listed=[{id:'dmicher-generics',title:'dmicher Generics',version:'1.0.0',help:true},{id:'dmicher-alpha',title:'Example module',version:'2.0',help:true}];
        const data={modules:listed,gm,premium:false,userId:user.id,session:'browserSession'};
        const message={id:'message',visible:true,isContentVisible:true,speaker:{alias:'Informer'},flags:{'dmicher-generics':{
          welcome:data,chat:{apiVersion:1,ownerId:'dmicher-generics',channel:'welcome'}}},getFlag(ns,key){return this.flags[ns]?.[key];}};
        window.game={user,users:new Map([[user.id,user]]),i18n:{lang:language},messages:new Map([[message.id,message]]),modules:new Map(listed.map(m=>[m.id,{...m,active:true}])),settings:{register(){},get(){return true;},sheet:{render:()=>calls.push('settings')}}};
        window.controller=createWelcomeController({informer:{portrait:'/module/assets/chat/token_dak.webp',createMessageService:()=>({})},premium:{},modules:{get:id=>id==='dmicher-alpha'?{openHelp:()=>calls.push('module-help')}:null},appearance:{openHelp:(...args)=>calls.push(['generics-help',...args])},help});
        controller.registerSettings();document.body.innerHTML='<article class="message"><header class="message-sender"><span class="avatar"><img></span></header><div class="message-content"></div></article><form><div class="form-group"><label>Welcome</label><input type="checkbox" name="dmicher-generics.showWelcome" checked></div></form>';
        hooks.get('renderChatMessageHTML')(message,document.querySelector('article'));
        hooks.get('renderSettingsConfig')({},document.querySelector('form'));
      },{language,gm});
      await page.locator('[data-dmicher-chat-action="settings"]').click();
      await page.locator('[data-dmicher-chat-action="help:dmicher-alpha"]').click();
      await page.locator('[data-dmicher-chat-action="help:dmicher-generics"]').click();
      await page.locator('[data-dmicher-setting-help]').click();
      assert.deepEqual(await page.evaluate(()=>calls),['settings','module-help',['generics-help'],['generics-help','welcome',undefined]]);
      assert.equal(await page.locator('input[type=checkbox]').isChecked(),true);
      assert.equal(await page.locator('.dmicher-welcome a[href*="boosty"]').count(),gm?1:0);
      await page.screenshot({path:path.join(output,`welcome-${version}-${language}-${gm?'gm':'player'}.png`)});
      report.push({version,language,role:gm?'gm':'player',test:'Rendered welcome Help/Settings actions and free-setting help question work',passed:true});
      await page.evaluate(()=>controller.dispose());
    }
    await page.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({scope:'Synthetic browser with installed Foundry 13/14 hyperlink handlers/core CSS; actual module export and welcome rendering',results:report},null,2));
console.log(JSON.stringify({passed:report.length,output},null,2));
