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
