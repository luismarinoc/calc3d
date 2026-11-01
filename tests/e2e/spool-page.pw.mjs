import { signedInEmptyTest as test, expect } from './supabase-fixture.mjs';
const stamp = '2026-01-01T00:00:00.000Z';
const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const brand = (remote,id,name) => ({id,owner_id:remote.user.id,name,normalized_name:name.toLowerCase(),aliases:[name.toLowerCase()],color:'#A78BFA',revision:1,created_at:stamp,updated_at:stamp});
const profile = (remote,id,name,material,brandId,price,color='') => ({id,owner_id:remote.user.id,name,material,brand:'',brand_id:brandId,filament_color:color,filament_color_hex:null,purchase_price:price,net_weight_grams:1000,revision:1,created_at:stamp,updated_at:stamp});

test('S10 consultation navigation opens its own page, not a dialog', async ({page}) => {
  await page.goto('/settings.html');
  const link = page.getByRole('link',{name:'Consultar bobinas',exact:true});
  await expect(link).toHaveAttribute('href','./spools.html');
  await link.click();
  await expect(page).toHaveURL(/\/spools.html$/);
  await expect(page.getByRole('heading',{name:'Consultar bobinas',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toBeVisible();
});

test('S10 LU filters instantly and preserves brand, material and price order without writes', async ({page,remote}) => {
  remote.brands=[brand(remote,ids[0],'Marca Uno'),brand(remote,ids[1],'Marca Dos')];
  remote.profiles=[profile(remote,ids[0],'PLA Plus natural','PLA',ids[0],15000),
    profile(remote,ids[1],'Fluorescente verde','PLA',ids[0],10000),
    profile(remote,ids[2],'PLA Negro','PLA',ids[1],8000)];
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row');
  await expect(rows).toHaveCount(3);
  await page.getByRole('combobox',{name:'Marca',exact:true}).selectOption({label:'Marca Uno'});
  await page.getByRole('combobox',{name:'Material',exact:true}).selectOption('PLA');
  await page.getByRole('combobox',{name:'Ordenar por',exact:true}).selectOption('price-asc');
  const before=JSON.stringify(remote.calls);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('LU');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Fluorescente verde');
  await expect(rows.nth(1)).toContainText('PLA Plus natural');
  await expect(page.getByRole('combobox',{name:'Marca',exact:true})).toHaveValue('Marca Uno');
  await expect(page.getByRole('combobox',{name:'Material',exact:true})).toHaveValue('PLA');
  await expect(page.getByRole('combobox',{name:'Ordenar por',exact:true})).toHaveValue('price-asc');
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('lu');
  await expect(rows).toHaveCount(2);
  expect(JSON.stringify(remote.calls)).toBe(before);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('sin coincidencias');
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'No hay bobinas'})).toBeVisible();
});

test('color composes locally with brand, material, search and price order', async ({page,remote}) => {
  remote.brands=[brand(remote,ids[0],'Marca Uno'),brand(remote,ids[1],'Marca Dos')];
  remote.profiles=[profile(remote,ids[0],'PLA Plus claro','PLA',ids[0],15000,'Azul claro'),
    profile(remote,ids[1],'PLA Plus intenso','PLA',ids[0],10000,'AZÚL CLARO'),
    profile(remote,ids[2],'PLA Plus verde','PLA',ids[0],8000,'Verde'),
    profile(remote,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','PLA Plus sin color','PLA',ids[0],7000)];
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row');
  await expect(rows).toHaveCount(4);
  const before=JSON.stringify(remote.calls);
  await page.getByRole('combobox',{name:'Marca',exact:true}).selectOption('Marca Uno');
  await page.getByRole('combobox',{name:'Material',exact:true}).selectOption('PLA');
  await page.getByRole('combobox',{name:'Ordenar por',exact:true}).selectOption('price-asc');
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('plus');
  const color=page.getByRole('combobox',{name:'Color',exact:true});
  await expect(color).toBeVisible({timeout:1000});
  await color.selectOption({label:'Azul claro'});
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('PLA Plus intenso');
  await expect(rows.nth(1)).toContainText('PLA Plus claro');
  await expect(color.locator('option')).toHaveCount(3);
  expect(JSON.stringify(remote.calls)).toBe(before);
  await page.getByRole('button',{name:'Actualizar lista'}).click();
  await expect(rows).toHaveCount(2);
  await expect(color).toHaveValue('azul claro');
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toHaveValue('plus');
  await expect(page.getByRole('combobox',{name:'Ordenar por',exact:true})).toHaveValue('price-asc');
  expect(remote.calls.filter(call=>/\/rpc\/calc3d_(save|archive)/.test(call.pathname))).toHaveLength(0);
});

const pending = remote => ({id:ids[2],owner_id:remote.user.id,name:'PLA Plus pendiente',material:'PLA',
  brand:'Marca Uno',brand_id:null,filament_color:'Azul',reference_price_clp:11990,
  source_url:'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-pendiente',
  supplier_sku:'PEND-LU',pending_reasons:['Peso por confirmar'],provenance:{source:'supplier'}});

test('pending rows retain links and reference price but no weight-based cost or quote action', async ({page,remote}) => {
  remote.supplierReferences=[pending(remote)];
  await page.goto('/spools.html');
  const row=page.locator('.consultation-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Peso por confirmar');
  await expect(row).toContainText('No cotizable');
  await expect(row).toContainText('CLP 11.990');
  await expect(row).not.toContainText('/kg');
  await expect(row.getByRole('button')).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('LU');
  const before=JSON.stringify(remote.calls);
  await page.getByRole('combobox',{name:'Color',exact:true}).selectOption({label:'Azul'});
  await expect(row).toHaveCount(1);
  expect(JSON.stringify(remote.calls)).toBe(before);
  await expect(row.getByRole('link')).toHaveAttribute('target','_blank');
  await expect(row.getByRole('link')).toHaveAttribute('rel','noopener noreferrer');
  expect(remote.calls.filter(c=>/\/rpc\/calc3d_(save|archive)/.test(c.pathname))).toHaveLength(0);
});

test('failed pending load is explicit, refresh recovers, and account switch removes old data and filters', async ({page,remote}) => {
  remote.supplierReferences=[pending(remote)];
  remote.fail='/rest/v1/calc3d_supplier_references';
  await page.goto('/spools.html');
  await expect(page.locator('#consultation-status')).toContainText('No se pudieron leer');
  await expect(page.locator('.consultation-row')).toHaveCount(0);
  remote.fail=null;
  await page.getByRole('button',{name:'Actualizar lista'}).click();
  await expect(page.locator('.consultation-row')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('LU');
  await page.getByRole('combobox',{name:'Marca',exact:true}).selectOption('Marca Uno');
  await page.getByRole('combobox',{name:'Color',exact:true}).selectOption({label:'Azul'});
  remote.user={...remote.user,id:'22222222-2222-4222-8222-222222222222',email:'second@example.test'};
  const error=await page.evaluate(async()=>{
    const {client}=await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({email:'second@example.test',password:'fake-password'})).error?.message??null;
  });
  expect(error).toBeNull();
  await expect(page.locator('#consultation-status')).toContainText('Todavía no hay');
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toHaveValue('');
  await expect(page.locator('#consultation-brand option')).toHaveCount(1);
  await expect(page.locator('#consultation-color option')).toHaveCount(1);
  await expect(page.locator('#consultation-color')).toHaveValue('');
  await expect(page.locator('.consultation-row')).toHaveCount(0);
  await expect(page.locator('#consultation-list a')).toHaveCount(0);
});

test('deferred old-owner results cannot repaint after a switch', async ({page,remote}) => {
  remote.profiles=[profile(remote,ids[0],'Privado primer dueño','PLA',null,10000)];
  let release;
  remote.holdProfiles=new Promise(resolve=>{release=resolve;});
  await page.goto('/spools.html');
  await expect.poll(()=>remote.reads['/rest/v1/calc3d_spool_profiles']??0).toBeGreaterThan(0);
  remote.user={...remote.user,id:'22222222-2222-4222-8222-222222222222',email:'second@example.test'};
  await page.evaluate(async()=>{
    const {client}=await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({email:'second@example.test',password:'fake-password'});
  });
  release();remote.holdProfiles=null;
  // Initial-admission switches can pass through login and then the calculator.
  // Remaining on this page or navigating away must never paint the old data.
  await expect.poll(()=>page.evaluate(()=>location.pathname!=='/spools.html' ||
    !!document.querySelector('#consultation-status')?.textContent.includes('Todavía no hay')).catch(()=>false)).toBe(true);
  await expect(page.locator('body')).not.toContainText('Privado primer dueño');
});

test('product link opens a new tab while the standalone page keeps its search and account unchanged', async ({page,remote}) => {
  const url='https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/tpu-1kg-negro';
  remote.profiles=[{...profile(remote,ids[0],'TPU Plus negro','TPU',null,12000),source_url:url}];
  await page.context().route('https://www.todotoner.cl/**',route=>route.fulfill({status:200,body:'<title>Producto</title>',contentType:'text/html'}));
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('LU');
  const before=JSON.stringify([remote.profiles,remote.supplierReferences,remote.number]);
  const link=page.getByRole('link',{name:'Ver producto: TPU Plus negro'});
  await expect(link).toHaveAttribute('href',url);
  const opened=page.waitForEvent('popup');await link.click();const popup=await opened;
  await expect(popup).toHaveURL(url);
  await expect(page).toHaveURL(/\/spools.html$/);
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toHaveValue('LU');
  expect(JSON.stringify([remote.profiles,remote.supplierReferences,remote.number])).toBe(before);
  await popup.close();
});

test('page remains usable without horizontal overflow and clear restores filters', async ({page,remote},testInfo) => {
  remote.brands=[brand(remote,ids[0],'Marca Uno')];
  remote.profiles=[profile(remote,ids[0],'PLA Plus presentación de nombre largo para comparar bobinas sin superposición','PLA',ids[0],19990,'Azul claro')];
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Color',exact:true}).selectOption({label:'Azul claro'});
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('nada coincide');
  await expect(page.locator('.consultation-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(page.locator('.consultation-row')).toHaveCount(1);
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Color',exact:true})).toHaveValue('');
  await expect(page.getByRole('searchbox',{name:'Buscar bobinas'})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`spool-page-${testInfo.project.name}.png`),fullPage:true});
});


test('material choices use base polymers without case or chemical-description duplicates', async ({page,remote}) => {
  remote.profiles=[profile(remote,ids[0],'PETG claro','Petg',null,12000),
    profile(remote,ids[1],'PETG oscuro','PETG (Polietileno Tereftalato Glicolado)',null,13000),
    profile(remote,ids[2],'PLA mejorado','PLA+',null,14000)];
  await page.goto('/spools.html');
  await expect(page.locator('.consultation-row')).toHaveCount(3);
  const material=page.getByRole('combobox',{name:'Material',exact:true});
  await expect(material.locator('option')).toHaveText(['Todos los materiales','PETG','PLA']);
  const before=JSON.stringify(remote.calls);
  await material.selectOption('PETG');
  await expect(page.locator('.consultation-row')).toHaveCount(2);
  expect(JSON.stringify(remote.calls)).toBe(before);
});

function fillLargeCatalog(remote) {
  const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
  remote.profiles=Array.from({length:1127},(_,i)=>profile(remote,id(i+1),
    (i<874?'PLA Plus natural ':'PETG oscuro ')+i,i<874?'PLA':'PETG',null,10000+i,'Negro'));
  remote.supplierReferences=Array.from({length:44},(_,i)=>({...pending(remote),id:id(i+5000),
    name:'PETG pendiente '+i,material:'PETG',supplier_sku:'REF-'+i}));
}

test('large catalogs keep typing responsive and retain all matching rows', async ({page,remote}) => {
  fillLargeCatalog(remote);
  await page.addInitScript(()=>{
    window.searchWork=[];window.largestPaint=0;let active=null;
    const create=Document.prototype.createElement;
    Document.prototype.createElement=function(...args){if(active)active.created++;return create.apply(this,args);};
    const add=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,callback,...rest){
      if(type==='input'&&this.id==='consultation-search'&&typeof callback==='function'){
        return add.call(this,type,function(...args){active={value:this.value,created:0};
          try{return callback.apply(this,args);}finally{window.searchWork.push(active);active=null;}},...rest);
      }
      return add.call(this,type,callback,...rest);
    };
  });
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row');
  await page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
  await expect(rows).toHaveCount(1171);
  await page.evaluate(()=>new MutationObserver(records=>{
    const count=records.flatMap(r=>[...r.addedNodes]).filter(n=>n.matches?.('.consultation-row')).length;
    window.largestPaint=Math.max(window.largestPaint,count);
  }).observe(document.querySelector('#consultation-list'),{childList:true}));
  const before=JSON.stringify([remote.calls,remote.profiles,remote.supplierReferences,remote.number]);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).focus();
  await page.keyboard.type('pla',{delay:20});
  await page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
  await expect(rows).toHaveCount(874);
  const work=await page.evaluate(()=>window.searchWork);
  expect(work.map(x=>x.value)).toEqual(['p','pl','pla']);
  expect(work.every(x=>x.created===0)).toBe(true);
  expect(await page.evaluate(()=>window.largestPaint)).toBeLessThanOrEqual(32);
  expect(JSON.stringify([remote.calls,remote.profiles,remote.supplierReferences,remote.number])).toBe(before);
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
  await expect(rows).toHaveCount(1171);
});

test('queued large result paints are discarded when the account changes', async ({page,remote}) => {
  fillLargeCatalog(remote);
  await page.goto('/spools.html');
  await page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
  await expect(page.locator('.consultation-row')).toHaveCount(1171);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('pla');
  remote.user={...remote.user,id:'22222222-2222-4222-8222-222222222222',email:'second@example.test'};
  await page.evaluate(async()=>{
    const {client}=await import('/src/auth/browser.mjs');
    await client.auth.signInWithPassword({email:'second@example.test',password:'fake-password'});
  });
  await expect(page.locator('#consultation-status')).toContainText('Todavía no hay');
  await page.evaluate(()=>new Promise(resolve=>{
    let frames=0;const next=()=>++frames===3?resolve():requestAnimationFrame(next);requestAnimationFrame(next);
  }));
  await expect(page.locator('.consultation-row')).toHaveCount(0);
  await expect(page.locator('#consultation-list a')).toHaveCount(0);
  await expect(page.locator('#consultation-color option')).toHaveCount(1);
});


function facetCatalog(remote) {
  remote.brands=[brand(remote,ids[0],'Bambu Lab'),brand(remote,ids[1],'Esun'),brand(remote,ids[2],'Polymaker')];
  remote.profiles=[profile(remote,ids[0],'Bambu PLA rojo','PLA',ids[0],10000,'Rojo'),
    profile(remote,ids[1],'Bambu PETG negro','PETG',ids[0],11000,'Negro'),
    profile(remote,ids[2],'Esun PLA negro','PLA',ids[1],12000,'Negro'),
    profile(remote,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','Polymaker TPU verde','TPU',ids[2],13000,'Verde'),
    profile(remote,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Polymaker PETG negro','PETG',ids[2],14000,'Negro')];
  remote.supplierReferences=[{...pending(remote),id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
    name:'Bambu PA12 azul pendiente',brand:'Bambu Lab',material:'PA12',filament_color:'Azul'}];
}

test('dynamic facets constrain brand material and color in both selection directions', async ({page,remote}) => {
  facetCatalog(remote);
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row');await expect(rows).toHaveCount(6);
  const brands=page.getByRole('combobox',{name:'Marca',exact:true});
  const materials=page.getByRole('combobox',{name:'Material',exact:true});
  const colors=page.getByRole('combobox',{name:'Color',exact:true});
  const before=JSON.stringify([remote.calls,remote.profiles,remote.supplierReferences,remote.number]);
  await brands.selectOption('Bambu Lab');
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PA12','PETG','PLA']);
  await expect(colors.locator('option')).toHaveText(['Todos los colores','Azul','Negro','Rojo']);
  await materials.selectOption('PLA');
  await expect(colors.locator('option')).toHaveText(['Todos los colores','Rojo']);
  await expect(brands.locator('option')).toHaveText(['Todas las marcas','Bambu Lab','Esun']);
  await colors.selectOption('rojo');
  await expect(brands.locator('option')).toHaveText(['Todas las marcas','Bambu Lab']);
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PLA']);
  await expect(rows).toHaveCount(1);
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(rows).toHaveCount(6);
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PA12','PETG','PLA','TPU']);
  await colors.selectOption('negro');
  await expect(brands.locator('option')).toHaveText(['Todas las marcas','Bambu Lab','Esun','Polymaker']);
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PETG','PLA']);
  await materials.selectOption('PETG');
  await expect(brands.locator('option')).toHaveText(['Todas las marcas','Bambu Lab','Polymaker']);
  await expect(colors.locator('option')).toHaveText(['Todos los colores','Negro']);
  await brands.selectOption('Polymaker');
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PETG']);
  await expect(rows).toHaveCount(1);await expect(rows).toContainText('Polymaker PETG negro');
  expect(JSON.stringify([remote.calls,remote.profiles,remote.supplierReferences,remote.number])).toBe(before);
});

test('dynamic facets retain missing selected values until the user clears filters', async ({page,remote}) => {
  facetCatalog(remote);
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row');await expect(rows).toHaveCount(6);
  const brands=page.getByRole('combobox',{name:'Marca',exact:true});
  const materials=page.getByRole('combobox',{name:'Material',exact:true});
  const colors=page.getByRole('combobox',{name:'Color',exact:true});
  await brands.selectOption('Bambu Lab');await materials.selectOption('PA12');await colors.selectOption('azul');
  await expect(rows).toHaveCount(1);await expect(rows).toContainText('No cotizable');
  remote.profiles=remote.profiles.filter(p=>p.brand_id!==ids[0]);remote.supplierReferences=[];
  const before=JSON.stringify([remote.profiles,remote.supplierReferences,remote.number]);
  await page.getByRole('button',{name:'Actualizar lista'}).click();
  await expect(page.locator('#consultation-status')).toContainText('No hay bobinas');
  await expect(brands).toHaveValue('Bambu Lab');await expect(materials).toHaveValue('PA12');await expect(colors).toHaveValue('azul');
  await expect(rows).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('sin coincidencias');
  await expect(brands).toHaveValue('Bambu Lab');await expect(materials).toHaveValue('PA12');await expect(colors).toHaveValue('azul');
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(rows).toHaveCount(3);
  await expect(brands).toHaveValue('');await expect(materials).toHaveValue('');await expect(colors).toHaveValue('');
  await expect(brands.locator('option')).toHaveText(['Todas las marcas','Esun','Polymaker']);
  await expect(materials.locator('option')).toHaveText(['Todos los materiales','PETG','PLA','TPU']);
  await expect(colors.locator('option')).toHaveText(['Todos los colores','Negro','Verde']);
  expect(JSON.stringify([remote.profiles,remote.supplierReferences,remote.number])).toBe(before);
  expect(remote.calls.filter(x=>/\/rpc\/calc3d_(save|archive)/.test(x.pathname))).toHaveLength(0);
});


test('complete catalog counts wait for the final paint rather than a partial batch', async ({page,remote}) => {
  fillLargeCatalog(remote);
  const stored=JSON.stringify([remote.profiles,remote.supplierReferences,remote.number]);
  await page.addInitScript(()=>{
    const raf=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window);
    let frames=0,next=-1;const pending=new Map();
    window.requestAnimationFrame=callback=>{
      if(frames>=35){const id=next--;pending.set(id,callback);return id;}
      return raf(time=>{frames++;callback(time);});
    };
    window.cancelAnimationFrame=id=>id<0?pending.delete(id):cancel(id);
    window.releaseCatalogFrames=()=>{
      window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;
      for(const callback of pending.values())raf(callback);pending.clear();
    };
  });
  await page.goto('/spools.html');
  const rows=page.locator('.consultation-row'),list=page.locator('#consultation-list');
  try {
    // Hold the producer at the same partial batch seen in the original CI trace.
    // A locator wait must not consume the frame callbacks controlled by this probe.
    await rows.nth(1119).waitFor({state:'attached'});
    await expect(rows).toHaveCount(1120);await expect(list).toHaveAttribute('aria-busy','true');
    const completed=page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
    await expect(list).toHaveAttribute('aria-busy','true');
    await page.evaluate(()=>window.releaseCatalogFrames());
    await completed;
    await expect(rows).toHaveCount(1171);await expect(list).toHaveAttribute('aria-busy','false');
    expect(JSON.stringify([remote.profiles,remote.supplierReferences,remote.number])).toBe(stored);
    expect(remote.calls.filter(call=>/\/rpc\/calc3d_(save|archive)/.test(call.pathname))).toHaveLength(0);
  } finally { await page.evaluate(()=>window.releaseCatalogFrames()); }
});
