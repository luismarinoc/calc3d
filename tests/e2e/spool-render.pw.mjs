import { signedInEmptyTest as test, expect } from './supabase-fixture.mjs';
const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const profile=(r,n,name)=>({id:id(n),owner_id:r.user.id,name,material:'PETG',brand:'',brand_id:null,filament_color:'Negro',purchase_price:12000,net_weight_grams:1000,revision:1,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
test('S9/S10 latest scheduled search and refreshed owner data win without writes',async({page,remote})=>{
 remote.profiles=Array.from({length:1171},(_,i)=>profile(remote,i+1,'PETG old '+i));
 await page.goto('/spools.html');const rows=page.locator('.consultation-row');await expect(rows).toHaveCount(1171);
 const before=JSON.stringify(remote.calls);
 await page.evaluate(()=>{const input=document.querySelector('#consultation-search');for(const value of ['old','absent','old 7','no match']){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}});
 await expect(rows).toHaveCount(0);await expect(page.locator('#consultation-status')).toContainText('No hay bobinas');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(rows).toHaveCount(0);expect(JSON.stringify(remote.calls)).toBe(before);
 remote.profiles=[profile(remote,2000,'PETG fresh')];
 await page.getByRole('button',{name:'Actualizar lista'}).click();await expect(rows).toHaveCount(0);
 await page.getByRole('searchbox',{name:'Buscar bobinas'}).fill('fresh');await expect(rows).toHaveCount(1);
 await expect(rows.first()).toContainText('PETG fresh');await expect(page.locator('#consultation-status')).toContainText('1 de 1');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(rows).toHaveCount(1);await expect(page.locator('body')).not.toContainText('PETG old');
 expect(remote.calls.filter(x=>/\/rpc\/calc3d_(save|archive)/.test(x.pathname))).toHaveLength(0);
});
