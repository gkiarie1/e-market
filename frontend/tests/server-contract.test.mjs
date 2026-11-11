import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeApiModule} from './helpers/photo-contract.mjs';

test('outdated API is caught before login or registration sends credentials',async()=>{
 const requests=[];
 const api=nativeApiModule(async(url)=>{requests.push(url);return {ok:true,status:200,json:async()=>({status:'ok'})};});
 await assert.rejects(api.login({email:'buyer@example.com',password:'secret'},false),/older version.*Restart FastAPI/);
 assert.deepEqual(requests,['http://marketplace.test/health']);
});
test('current API health allows account authentication',async()=>{
 const requests=[];
 const api=nativeApiModule(async(url)=>{requests.push(url);return {ok:true,status:200,json:async()=>url.endsWith('/health')?{apiVersion:3}:{token:'test-token',profile:{id:'buyer'}}};});
 assert.equal((await api.login({},false)).token,'test-token');
 assert.deepEqual(requests,['http://marketplace.test/health','http://marketplace.test/auth/login']);
});
test('validation errors identify the rejected input field',async()=>{
 const api=nativeApiModule(async()=>({ok:false,status:422,json:async()=>({detail:[{loc:['body','wholesale_price'],msg:'Extra inputs are not permitted'}]})}));
 await assert.rejects(api.request('/listings','POST',{}),/wholesale_price: Extra inputs are not permitted/);
});
