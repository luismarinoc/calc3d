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
