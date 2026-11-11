import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState, rating, money } from '../src/model.ts';
test('seller rating averages reviews and handles unrated sellers',()=>{
 const state={...emptyState,reviews:[{id:'1',farmerId:'f1',author:'A',rating:5,text:'Fresh'},{id:'2',farmerId:'f1',author:'B',rating:3,text:'Good'}]};
 assert.equal(rating(state,'f1'),4);
 assert.equal(rating(state,'unknown'),0);
});
test('empty app starts without fabricated accounts or listings',()=>{
 assert.equal(emptyState.profile,null);
 assert.equal(emptyState.listings.length,0);
 assert.equal(emptyState.orders.length,0);
 assert.equal(money(1000),'KSh 1,000');
});

test('wholesale pricing changes exactly at the minimum quantity',async()=>{
 const {unitPrice}=await import('../src/model.ts');
 const listing={price:120,minimum:1,wholesalePrice:85,wholesaleMinimum:10};
 assert.equal(unitPrice(listing,9),120);
 assert.equal(unitPrice(listing,10),85);
 assert.equal(unitPrice(listing,11),85);
 assert.equal(unitPrice({...listing,wholesalePrice:null},10),120);
});
