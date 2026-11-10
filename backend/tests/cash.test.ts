import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';
import { cashConference, type SalePayment } from '../src/modules/cash/conference.js';

test('conferência em centavos distingue dinheiro, troco e vendas pendentes', () => {
  const cash: SalePayment = { id_venda:1, status:'FINALIZADA', valor_total:'17.77', id_pagamento:1,
    valor:'7.77', valor_recebido:'10.00', troco:'2.23', dinheiro:1 };
  const payments = [cash, { ...cash, id_pagamento:2, valor:'10.00', dinheiro:0 },
    { ...cash, id_venda:2, status:'CANCELADA' },{ ...cash, id_venda:3, status:'ABERTA' }];
  const result = cashConference('150.00','157.76',payments);
  assert.deepEqual(result,{ recebido_dinheiro:'7.77',valor_esperado:'157.77',diferenca:'-0.01',
    resultado:'FALTA',vendas_abertas:1,vendas_pendentes:0,divergencias:[] });
  assert.equal(cashConference('150.00','157.77',payments).resultado,'CONFERIDO');
  assert.equal(cashConference('150.00','157.78',payments).diferenca,'0.01');
  const disputed = cashConference('0.00',null,[{ ...cash, troco:'2.24' }]);
  assert.equal(disputed.vendas_pendentes,1);
  assert.deepEqual(disputed.divergencias,[{id_pagamento:1,aplicado:'7.77',liquido:'7.76'}]);
  assert.equal(cashConference('0.01','0.30',[{...cash,valor_total:'0.29',valor:'0.29',valor_recebido:null,troco:null}]).diferenca,'0.00');
});

test('sessões oficiais serializam abertura e fechamento e protegem operadores', async context => {
  const secret = 'segredo-isolado-apenas-para-teste-de-caixa';
  const origin = 'http://127.0.0.1:5176';
  const auth = authService({byMatricula:async()=>undefined,
    byId:async id=>({id,matricula:id===1?'ADMIN':'OPERADOR'}) as Employee},secret,300,true);
  type Session = {id_sessao:number; id_caixa:number; id_operador:number; fundo_troco:string; data_fechamento:string|null; valor_contado:string|null};
  const sessions = new Map<number,Session>();
  let queue = Promise.resolve();
  let fail = false;
  let openSales = false;
  let rollbacks = 0;
  let releases = 0;
  const calls: {sql:string;args:unknown[]}[] = [];
  async function execute(sql:string,args:unknown[] = []) {
    calls.push({sql,args});
    if (sql.startsWith('SELECT id_funcionario')) return [args[0] === 3 ? [] : [{id_funcionario:args[0]}]];
    if (sql.startsWith('SELECT ativo FROM caixa')) return [args[0] === 99 ? [] : [{ativo:args[0] === 98 ? 0 : 1}]];
    if (sql.startsWith('SELECT id_caixa FROM sessao_caixa')) return [[...sessions.values()].filter(s=>s.data_fechamento===null && (s.id_caixa===args[0] || s.id_operador===args[1]))];
    if (sql.includes('MAX(id_sessao)')) return [[{maxId:Math.max(3,...sessions.keys())}]];
    if (sql.startsWith('INSERT INTO sessao_caixa')) {
      const [key,terminal,employee,fund] = args as [number,number,number,string];
      assert.match(sql,/CURRENT_TIMESTAMP,NULL,\?,NULL/);
      sessions.set(key,{id_sessao:key,id_caixa:terminal,id_operador:employee,fundo_troco:fund,data_fechamento:null,valor_contado:null});
      return [{}];
    }
    if (sql.startsWith('UPDATE sessao_caixa')) {
      const row = sessions.get(Number(args[1]))!;
      row.data_fechamento='2026-11-10 12:00:00';
      row.valor_contado=String(args[0]);
      return [{}];
    }
    if (sql.startsWith('SELECT v.id_venda')) {
      if (fail) throw new Error('falha após escrita');
      return [openSales ? [{id_venda:1,status:'ABERTA'}] : []];
    }
    if (sql.includes('WHERE s.id_sessao=?') || sql.startsWith('SELECT * FROM sessao_caixa')) {
      const row = sessions.get(Number(args[0]));
      return [row ? [{...row}] : []];
    }
    return [[]];
  }
  const pool = {execute,async getConnection() {
    let snapshot: Map<number,Session>;
    let unlock: (()=>void) | undefined;
    const acquire = async () => {
      const previous=queue;
      queue=new Promise<void>(resolve=>{unlock=resolve;});
      await previous;
    };
    return {
      async execute(sql:string,args:unknown[]) {
        if (sql.includes('GET_LOCK')) { calls.push({sql,args}); await acquire(); return [[{acquired:1}]]; }
        if (sql.includes('RELEASE_LOCK')) { calls.push({sql,args}); unlock?.(); unlock=undefined; return [[{released:1}]]; }
        return execute(sql,args);
      },
      async beginTransaction() { if (!unlock) await acquire(); snapshot=structuredClone(sessions); },
      async commit() {},
      async rollback() { rollbacks++; sessions.clear(); for(const [key,row] of snapshot) sessions.set(key,row); },
      release() { releases++; unlock?.(); },
    };
  }} as unknown as Pool;
  const server=createApp({corsOrigin:origin,database:pool,official:true,admins:['ADMIN'],checkDatabase:async()=>{},
    auth:{service:auth,ttl:300,secure:false}}).listen(0,'127.0.0.1');
  context.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  await once(server,'listening');
  const address=server.address();
  assert.ok(address && typeof address==='object');
  const base='http://127.0.0.1:'+address.port+'/api/v1/sessoes-caixa';
  const cookie=(actor:number)=>auth.cookieName+'='+jwt.sign({},secret,{subject:String(actor),issuer:'supermercado-qualidade-lider',audience:'funcionario-oficial',expiresIn:300});
  const send=(path:string,body?:object,actor=1,source=origin)=>fetch(base+path,{
    method:body?'POST':'GET',headers:{Origin:source,Cookie:actor?cookie(actor):'','Content-Type':'application/json'},
    body:body&&JSON.stringify(body),
  });
  const open={id_caixa:2,fundo_troco:'0.00'};
  assert.equal((await send('/abrir',open,0)).status,401);
  assert.equal((await send('/abrir',open,1,'https://externo.invalid')).status,403);
  assert.equal((await send('/abrir',{...open,id_operador:2})).status,400);
  for(const amount of ['-1','1.001','100000000.00']) assert.equal((await send('/abrir',{...open,fundo_troco:amount})).status,400);
  assert.equal((await send('/abrir',{...open,id_caixa:99})).status,404);
  assert.equal((await send('/abrir',{...open,id_caixa:98})).status,409);
  assert.equal((await send('/abrir',open,3)).status,403);
  fail=true;
  assert.equal((await send('/abrir',open)).status,500);
  assert.equal(sessions.size,0);
  fail=false;
  const opens=await Promise.all([send('/abrir',open),send('/abrir',open,2)]);
  assert.deepEqual(opens.map(response=>response.status).sort(),[201,409]);
  const opened=await opens.find(response=>response.status===201)!.json();
  const actor=opened.id_operador;
  const other=actor===1?2:1;
  assert.equal(opened.id_sessao,4);
  assert.equal(opened.fundo_troco,'0.00');
  assert.equal((await send('/abrir',{...open,id_caixa:3},actor)).status,409);
  assert.equal((await send('/4/fechar',{valor_contado:'0.00'},other)).status,403);
  assert.equal((await send('/99/fechar',{valor_contado:'0.00'},actor)).status,404);
  assert.equal((await send('/4/fechar',{valor_contado:'-1'},actor)).status,400);
  assert.equal((await send('/4/fechar',{valor_contado:'x'},actor)).status,400);
  openSales=true;
  assert.equal((await send('/4/fechar',{valor_contado:'0.00'},actor)).status,409);
  openSales=false;
  const closing=await Promise.all([send('/4/fechar',{valor_contado:'0.00'},actor),send('/4/fechar',{valor_contado:'0.00'},actor)]);
  assert.deepEqual(closing.map(response=>response.status).sort(),[200,409]);
  assert.equal(sessions.get(4)?.data_fechamento,'2026-11-10 12:00:00');
  assert.equal((await send('/abrir',{...open,fundo_troco:'100.01'},actor)).status,201);
  assert.equal(sessions.get(5)?.fundo_troco,'100.01');
  assert.equal((await send('/5/fechar',{valor_contado:'100.01'},actor)).status,200);
  const sameOperator = await Promise.all([
    send('/abrir',{...open,id_caixa:2},actor),
    send('/abrir',{...open,id_caixa:3},actor),
  ]);
  assert.deepEqual(sameOperator.map(response=>response.status).sort(),[201,409]);
  const conflict = await sameOperator.find(response=>response.status===409)!.json();
  assert.equal(conflict.error.code,'OPERATOR_BUSY');
  assert.equal((await send('?operador=1',undefined,2)).status,403);
  assert.equal((await send('?ordem=SELECT')).status,400);
  assert.ok(rollbacks > 0 && releases > rollbacks);
  assert.equal(calls.filter(({sql})=>sql.includes('GET_LOCK')).length,calls.filter(({sql})=>sql.includes('RELEASE_LOCK')).length);
});
