import { signedInEmptyTest as test, expect } from './supabase-fixture.mjs';
const stamp='2026-01-01T00:00:00.000Z';
const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const brandId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
function catalog(remote) {
  remote.brands=[{id:brandId,owner_id:remote.user.id,name:'Bambu Lab',normalized_name:'bambu lab',aliases:['bambu lab'],color:'#61D95B',revision:1,created_at:stamp,updated_at:stamp}];
  remote.profiles=[
    {id:ids[0],name:'ABS Blanco 1kg',filament_color:'Blanco',filament_color_hex:null},
    {id:ids[1],name:'ABS muestra personalizada 1kg',filament_color:'Blanco',filament_color_hex:'#123456'},
    {id:ids[2],name:'ABS multicolor 1kg',filament_color:'Arcoíris translúcido',filament_color_hex:null},
  ].map(p=>({owner_id:remote.user.id,material:'ABS',brand:'Bambu Lab',brand_id:brandId,purchase_price:13990,net_weight_grams:1000,revision:1,created_at:stamp,updated_at:stamp,...p}));
  remote.supplierReferences=[{id:ids[3],owner_id:remote.user.id,name:'PETG Negro pendiente',material:'PETG',brand:'Bambu Lab',brand_id:brandId,filament_color:'Negro',reference_price_clp:11990,source_url:'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/filamento-pendiente',supplier_sku:'PEND-COLOR',pending_reasons:['Peso por confirmar'],provenance:{source:'supplier'}}];
}
const stored=r=>JSON.stringify([r.profiles,r.supplierReferences,r.brands,r.number]);
const writes=r=>r.calls.filter(c=>/\/rpc\/calc3d_(save|archive)/.test(c.pathname));
async function ready(page) {await expect(page.locator('.account-nav')).toBeVisible();await expect(page.locator('main')).toHaveJSProperty('inert',false);}
async function switchOwner(page,remote) {
  remote.user={...remote.user,id:'22222222-2222-4222-8222-222222222222',email:'second@example.test'};
  const error=await page.evaluate(async()=>{
    const {client}=await import('/src/auth/browser.mjs');
    return (await client.auth.signInWithPassword({email:'second@example.test',password:'fake-password'})).error?.message??null;
  });
  expect(error).toBeNull();
}
async function chooseSettings(page,name) {
  await page.locator('.spool-picker-trigger').click();
  await page.locator('#spool-picker-list').getByRole('option',{name:new RegExp(name)}).click();
}

test('Settings separates filament color from brand in one automatic read-only field',async({page,remote},info)=>{
  remote.role='admin';
  catalog(remote);const before=stored(remote);
  await page.goto('/settings.html');await ready(page);
  await chooseSettings(page,'ABS Blanco 1kg');
  const trigger=page.locator('.spool-picker-trigger');
  await expect(trigger.locator('.brand-chip, .filament-chip').first()).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(trigger.locator('.brand-chip')).toHaveCSS('background-color','rgb(97, 217, 91)');
  await page.locator('#edit-spool').click();
  const field=page.getByLabel('Color del filamento',{exact:true});
  await expect(field).toHaveAttribute('readonly','');
  await expect(page.locator('#spool-showSample, #spool-filamentColorHex')).toHaveCount(0);
  await expect(page.locator('#spool-form input[type="color"]')).toHaveCount(0);
  await expect(page.locator('.spool-filament-field')).toHaveCount(1);
  await expect(field).toHaveValue('Blanco');await expect(field).not.toBeEditable();
  const preview=page.locator('#spool-filament-preview');
  await expect(preview.locator('.filament-chip')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(preview).toContainText('Aprox.');
  await page.locator('#spool-form').screenshot({path:info.outputPath('settings-filament-color.png')});
  await chooseSettings(page,'ABS muestra personalizada 1kg');await page.locator('#edit-spool').click();
  await expect(field).toHaveValue('Blanco');
  await expect(preview.locator('.filament-chip')).toHaveCSS('background-color','rgb(18, 52, 86)');
  await expect(preview).not.toContainText('Aprox.');
  await chooseSettings(page,'ABS multicolor 1kg');await page.locator('#edit-spool').click();
  await expect(field).toHaveValue('Arcoíris translúcido');
  await expect(preview.locator('.filament-chip')).toHaveCount(0);await expect(preview).toContainText('Sin muestra');
  expect(stored(remote)).toBe(before);expect(writes(remote)).toEqual([]);
  await switchOwner(page,remote);
  await expect(field).toBeEmpty();await expect(preview.locator('.filament-chip')).toHaveCount(0);
  await expect(trigger.locator('.filament-chip')).toHaveCount(0);
  expect(stored(remote)).toBe(before);expect(writes(remote)).toEqual([]);
});


test('explicit price saves preserve registered color metadata and never persist an approximate sample',async({page,remote})=>{
  remote.role='admin';
  catalog(remote);
  const before=structuredClone(remote.profiles),brands=structuredClone(remote.brands),refs=structuredClone(remote.supplierReferences);
  await page.goto('/settings.html');await ready(page);
  for(const original of before) {
    await chooseSettings(page,original.name);await page.locator('#edit-spool').click();
    await expect(page.getByLabel('Color del filamento',{exact:true})).toHaveValue(original.filament_color);
    const priorWrites=writes(remote).length;
    await page.locator('#spool-purchasePrice').fill(String(original.purchase_price+100));
    expect(writes(remote)).toHaveLength(priorWrites);
    await page.locator('#save-spool').click();
    await expect(page.locator('#spool-feedback')).toContainText('Bobina guardada');
    const updated=remote.profiles.find(p=>p.id===original.id);
    expect(updated).toMatchObject({id:original.id,owner_id:original.owner_id,brand_id:original.brand_id,name:original.name,material:original.material,filament_color:original.filament_color,filament_color_hex:original.filament_color_hex,purchase_price:original.purchase_price+100,net_weight_grams:original.net_weight_grams,revision:original.revision+1});
    expect(writes(remote)).toHaveLength(priorWrites+1);
    await page.reload();await ready(page);
  }
  expect(remote.profiles.map(p=>p.id).sort()).toEqual(before.map(p=>p.id).sort());
  expect(remote.brands).toEqual(brands);expect(remote.supplierReferences).toEqual(refs);expect(remote.number).toBe(0);
});

test('consultation has a dedicated labeled filament-color column with safe fallback and pending prices',async({page,remote},info)=>{
  catalog(remote);const before=stored(remote);
  await page.goto('/spools.html');await ready(page);
  await page.locator('#consultation-list[aria-busy="false"]').waitFor({state:'attached'});
  await expect(page.locator('.catalog-columns > span')).toHaveText(['Presentación','Color del filamento','Precio guardado','Comparación por kg','Origen']);
  const rows=page.locator('.consultation-row');await expect(rows).toHaveCount(4);
  const white=rows.filter({hasText:'ABS Blanco 1kg'}).locator('.consultation-filament');
  await expect(white.locator('.filament-chip')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(white).toContainText('Blanco');await expect(white).toContainText('Aprox.');
  const custom=rows.filter({hasText:'ABS muestra personalizada 1kg'}).locator('.consultation-filament');
  await expect(custom.locator('.filament-chip')).toHaveCSS('background-color','rgb(18, 52, 86)');await expect(custom).not.toContainText('Aprox.');
  const special=rows.filter({hasText:'ABS multicolor 1kg'}).locator('.consultation-filament');
  await expect(special).toContainText('Arcoíris translúcido');await expect(special).toContainText('Sin muestra');await expect(special.locator('.filament-chip')).toHaveCount(0);
  const pending=rows.filter({hasText:'PETG Negro pendiente'});
  await expect(pending.locator('.filament-chip')).toHaveCSS('background-color','rgb(0, 0, 0)');await expect(pending.locator('.consultation-filament')).toContainText('Aprox.');
  await expect(pending).toContainText('No cotizable');await expect(pending).toContainText('CLP 11.990');await expect(pending).not.toContainText('/kg');await expect(pending.getByRole('button')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.catalog-shell').screenshot({path:info.outputPath('consultation-filament-color.png')});
  expect(stored(remote)).toBe(before);expect(writes(remote)).toEqual([]);
  await switchOwner(page,remote);
  await expect(page.locator('#consultation-status')).toContainText('Todavía no hay');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(rows).toHaveCount(0);await expect(page.locator('.consultation-filament')).toHaveCount(0);
  expect(stored(remote)).toBe(before);expect(writes(remote)).toEqual([]);
});

test('Calculator keeps its existing brand-first picker and explicit-sample behavior',async({page,remote})=>{
  catalog(remote);const before=stored(remote);
  await page.goto('/');await ready(page);
  const trigger=page.locator('.calculator-spool-picker .spool-picker-trigger');
  await trigger.click();await page.locator('#calculator-spool-picker-list').getByRole('option',{name:/ABS Blanco 1kg/}).click();
  await expect(trigger.locator('.brand-chip, .filament-chip').first()).toHaveCSS('background-color','rgb(97, 217, 91)');await expect(trigger.locator('.filament-chip')).toHaveCount(0);
  await trigger.click();await page.locator('#calculator-spool-picker-list').getByRole('option',{name:/ABS muestra personalizada 1kg/}).click();
  await expect(trigger.locator('.brand-chip, .filament-chip').first()).toHaveCSS('background-color','rgb(97, 217, 91)');await expect(trigger.locator('.filament-chip')).toHaveCSS('background-color','rgb(18, 52, 86)');
  expect(stored(remote)).toBe(before);expect(writes(remote)).toEqual([]);
});
