import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({channel:'chrome', headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const pages = [await context.newPage()];
const log=[];
const state=async page=>page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>/\/src\/state\.ts(?:\?|$)/.test(e.name))?.name || '/src/state.ts';
  const s=(await import(url)).getState();
  return {x:s.x,z:s.z,seated:s.seated,pendingSeat:s.pendingSeat,action:s.action,status:s.status,toast:s.toast};
});
for (const [i,page] of pages.entries()) page.on('websocket',ws=>{
  ws.on('framereceived',({payload})=>{
    const raw=String(payload);
    if(raw.startsWith('42["correction"') || raw.startsWith('43'))log.push({i,at:Date.now(),raw});
  });
  ws.on('framesent',({payload})=>{const raw=String(payload);if(raw.includes('pose')||raw.includes('seat:')||raw.includes('world:interact'))log.push({i,at:Date.now(),sent:raw});});
});
try{
  const room='seat-diagnostic-'+Date.now();
  for(const [i,page] of pages.entries()){
    await page.goto('http://localhost:5173/?room='+room+'&instance=0&region=apac');
    await page.getByLabel('Tên hiển thị',{exact:true}).fill('Seat diagnostic '+i);
    await page.getByRole('button',{name:'Bước vào sân chùa',exact:true}).tap();
    await expect(page.locator('.onboarding')).toHaveCount(0);
  }
  for(const [i,page] of pages.entries()){
    await page.waitForTimeout(1800);
    await page.getByRole('button',{name:'Chuỗi hạt',exact:true}).tap();
    await page.getByRole('button',{name:'Lần thêm một hạt',exact:true}).tap();
    await page.getByRole('button',{name:'Đóng bảng',exact:true}).tap();
    await page.getByRole('button',{name:'Ngồi thiền',exact:true}).tap();
    for(let t=0;t<22;t++){
      await page.waitForTimeout(1000);
      const s=await state(page);log.push({i,t,s});console.log(JSON.stringify({i,t,s}));
      if(s.seated)break;
    }
    await page.screenshot({path:'artifacts/seat-diagnostic-'+i+'.png'});
  }
}finally{await writeFile('artifacts/seat-diagnostic.json',JSON.stringify(log,null,2));await browser.close();}
