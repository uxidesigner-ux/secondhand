import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchLimitNotice} from '../src/search-limit.js';

const response = (status=200,retryAfter) => ({status,headers:new Headers(retryAfter===undefined?{}:{'Retry-After':retryAfter})});
const quota = changes => ({rateLimit:{scope:'ip-instance',limit:12,remaining:2,resetAfter:60,...changes}});

test('only measured requests at or above eighty percent produce a warning',()=>{
  const notice=createSearchLimitNotice({now:()=>1000});
  assert.deepEqual(notice.current(),{kind:null,remainingSeconds:0,message:''});
  assert.equal(notice.observe(response(),quota({remaining:3})).kind,null);
  const warning=notice.observe(response(),quota());
  assert.equal(warning.kind,'warning');assert.equal(warning.remainingSeconds,60);
  assert.match(warning.message,/검색 요청이 많아/);
  assert.doesNotMatch(warning.message,/80|남은|무료|비용|%/);
  assert.equal(notice.observe(response(),quota({remaining:0})).kind,'warning');
});

test('missing, malformed and unrelated usage metadata never creates warnings',()=>{
  for(const payload of [null,{}, {rateLimit:[]},quota({scope:'global'}),quota({limit:0}),quota({limit:12.5}),
    quota({limit:1000001}),quota({remaining:-1}),quota({remaining:13}),quota({remaining:'2'}),
    quota({resetAfter:0}),quota({resetAfter:121}),quota({resetAfter:'60'}),quota({resetAfter:Infinity})]){
    assert.equal(createSearchLimitNotice().observe(response(),payload).kind,null);
  }
  for(const status of [undefined,'200',400,401,403,500,503]){
    assert.equal(createSearchLimitNotice().observe({status},quota()).kind,null);
  }
  assert.equal(createSearchLimitNotice().observe({...response(),redirected:true},quota()).kind,null);
});

test('a warning expires without network polling and subsequent observations do not extend it',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  notice.observe(response(),quota({resetAfter:20}));
  time+=5000;
  assert.equal(notice.observe(response(),quota({resetAfter:60})).remainingSeconds,15);
  time+=14999;
  assert.equal(notice.current().remainingSeconds,1);
  time+=1;
  assert.deepEqual(notice.current(),{kind:null,remainingSeconds:0,message:''});
  assert.equal(notice.observe(response(),quota({resetAfter:40})).remainingSeconds,40);
});

test('dismissing a warning keeps it hidden for the rest of the same local window',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  notice.observe(response(),quota());
  assert.equal(notice.dismiss().kind,null);
  time+=10_000;
  assert.equal(notice.observe(response(),quota({remaining:1,resetAfter:50})).kind,null);
  assert.equal(notice.observe(response(),{}).kind,null);
  time+=50_000;
  assert.equal(notice.observe(response(),quota()).kind,'warning');
});

test('the measured reset deadline can shorten a warning without changing its dismissed state',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  notice.observe(response(),quota());notice.dismiss();
  time+=5000;
  assert.equal(notice.observe(response(),quota({resetAfter:2})).kind,null);
  time+=2000;
  assert.equal(notice.observe(response(),quota()).kind,'warning');
});

test('429 replaces a warning with a non-dismissible Retry-After countdown',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  notice.observe(response(),quota());notice.dismiss();
  const blocked=notice.observe(response(429,'18'),{code:'API_RATE_LIMIT'});
  assert.deepEqual(blocked,{kind:'blocked',remainingSeconds:18,message:'잠시 쉬어가요. 18초 후 다시 검색할 수 있어요.'});
  assert.equal(notice.dismiss().kind,'blocked');
  time+=3000;
  assert.equal(notice.observe(response(),quota({resetAfter:1})).remainingSeconds,15);
  time+=14999;
  assert.equal(notice.current().remainingSeconds,1);
  time++;
  assert.deepEqual(notice.current(),{kind:null,remainingSeconds:0,message:''});
});

test('a later server limit can lengthen blocking but a smaller reply cannot shorten it',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  notice.observe(response(429,'20'),{});
  time+=5000;
  assert.equal(notice.observe(response(429,'2'),{}).remainingSeconds,15);
  assert.equal(notice.observe(response(429,'30'),{}).remainingSeconds,30);
});

test('HTTP-date Retry-After is measured against the injected clock',()=>{
  let time=Date.UTC(2026,10,6,0,0,0);
  const notice=createSearchLimitNotice({now:()=>time});
  assert.equal(notice.observe(response(429,new Date(time+27_000).toUTCString()),{}).remainingSeconds,27);
  time+=27_000;
  assert.equal(notice.current().kind,null);
  assert.equal(notice.observe(response(429,new Date(time-1000).toUTCString()),{}).remainingSeconds,1);
});

test('429 fallback and malformed Retry-After values use bounded safe waits',()=>{
  const seconds=(header,payload={})=>createSearchLimitNotice({now:()=>Date.UTC(2026,10,6)}).observe(response(429,header),payload).remainingSeconds;
  assert.equal(seconds(undefined),60);
  assert.equal(seconds(undefined,quota({resetAfter:25})),25);
  assert.equal(seconds('invalid',quota({resetAfter:25})),25);
  assert.equal(seconds('-2'),60);
  assert.equal(seconds('0'),1);
  assert.equal(seconds('1000000'),120);
  assert.equal(seconds('12.5'),60);
  assert.equal(seconds(undefined,quota({resetAfter:999})),60);
});

test('returned state cannot mutate the notice and clock drift never shows negative or unbounded seconds',()=>{
  let time=1000;
  const notice=createSearchLimitNotice({now:()=>time});
  const state=notice.observe(response(429,'60'),{});state.kind=null;state.message='changed';
  assert.equal(notice.current().kind,'blocked');
  time-=1000000;
  assert.equal(notice.current().remainingSeconds,120);
  time+=2000000;
  assert.equal(notice.current().remainingSeconds,0);
});
