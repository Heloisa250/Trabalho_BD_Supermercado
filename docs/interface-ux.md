# Script 11 — Interface, experiência de uso e regra temporal

## Diagnóstico inicial

| Área | Situação encontrada | Tratamento |
| --- | --- | --- |
| Navegação | Lista plana de 17 links, sem destaque do item atual, sem agrupamento; no celular ocupava a tela inteira acima do conteúdo. | Menu agrupado (Visão geral, Frente de caixa, Relatórios, Compras, Estoque, Catálogo, Administração), link ativo destacado, menu recolhível em telas < 768 px, cabeçalho fixo com operador, matrícula, cargo, "Alterar senha" e "Sair". |
| Página inicial | Cartões "Caixas e vendas — Em desenvolvimento" e "Relatórios — Em desenvolvimento" desatualizados. | Acesso rápido gerado a partir dos mesmos grupos do menu (respeita permissões). |
| Componentes | Classes Tailwind repetidas página a página (ex.: o mesmo padrão de rótulo 32 vezes); sem badge, aviso ou estado vazio compartilhados. | `components/ui.tsx`: botões (padrão, primário, perigo) com foco visível, `Badge`, `Notice`, `Loading`, `Empty`, `Field`, `PageHeader`. `adminFields` reexporta `buttonClass`/`inputClass`, preservando os imports. |
| Datas na tela | Estoque, Compras e Sessões exibiam DATETIME (gravado em UTC) sem conversão: entrada às 09:26 de Brasília aparecia como 12:26. O PDV convertia pelo fuso do navegador. | `services/format.ts`: DATE exibido sem fuso; DATETIME convertido para America/Sao_Paulo em todas as telas. |
| Data comercial no servidor | Estoque, PDV, finalização e funcionários comparavam com `CURRENT_DATE` do MySQL (UTC); o dashboard usava Brasília. Entre 21h e 24h as regras de validade divergiam. | `config/business-time.ts` (ver abaixo). |
| Status | Texto puro ("ENVIADO", "ATIVO", "baixo"). | `Badge` com texto e cor (nunca só cor). |
| Formulários administrativos | Campos obrigatórios só validados pelo navegador, sem indicação visual. | Marcador `*` e legenda "Campos com * são obrigatórios". Validações do servidor inalteradas. |
| PDV | Após finalizar, o botão verde "Nova venda" aparecia logo acima do comprovante. | Ver "Venda nº 7". |
| Dashboard | Situações em texto, estados vazios como texto solto. | Badges e estado vazio compartilhado; consultas e fórmulas do Script 10 inalteradas. |

## Regra temporal única

`backend/src/config/business-time.ts` e `frontend/src/services/format.ts`:

1. **Timestamps operacionais** (`DATETIME`: venda, pagamento, movimentação, sessão, pedido) são gravados em UTC por `CURRENT_TIMESTAMP` do MySQL e exibidos em `America/Sao_Paulo`.
2. **Datas civis** (`DATE`: validade, fabricação, demissão, data prevista) são texto `YYYY-MM-DD`, exibidas como DD/MM/AAAA **sem conversão de fuso**.
3. **Data comercial ("hoje")** = dia corrente em `America/Sao_Paulo` (`businessDate()`), usada por: validade e disponibilidade no Estoque, no PDV e na finalização (FEFO), fabricação não futura no recebimento, demissão de funcionários (login, caixa, PDV) e alertas do Dashboard. Ela entra no SQL como literal `DATE 'YYYY-MM-DD'` gerado e validado pelo servidor, nunca vindo do cliente.
4. O agrupamento do Dashboard usa deslocamento fixo de −3 h (testado contra o fuso real; o Brasil não tem horário de verão desde 2019).
5. Horários históricos do DML não foram alterados (ver `dashboard-metricas.md`).

**Mudança de regra documentada**: antes, entre 21h e 24h de Brasília, um lote com validade no dia corrente já era tratado como vencido pelo Estoque/PDV (data UTC do dia seguinte) e como válido pelo Dashboard. Agora os três usam o mesmo dia comercial: o lote vale até o fim do dia em Brasília.

## Venda nº 7 — investigação

- **Fato**: venda nº 7, ABERTA, sessão 5, sem itens, `data_hora` 13:52:46 UTC (10:52 em Brasília), cerca de 4 minutos após a finalização da venda nº 6.
- **Código**: a única chamada `POST /vendas` no React é o clique em "Nova venda". Não há efeito de montagem, reexecução de `useEffect`, recarga ou nova tentativa automática que crie venda (mutações do TanStack Query não repetem por padrão).
- **Servidor**: já garantia no máximo uma venda ABERTA por sessão (lock nomeado + `FOR UPDATE`); um duplo clique não pode criar duas.
- **Conclusão**: a venda nº 7 corresponde a **um clique explícito** em "Nova venda". O histórico de rede do navegador da sessão de testes não estava mais disponível para identificar quem clicou. Fator de UX contribuinte: após a finalização, o botão "Nova venda" ficava em destaque logo acima do comprovante.
- **Correções**:
  - `POST /vendas` passou a **recuperar** a venda aberta existente (HTTP 200, `recuperada: true`) em vez de responder 409; uma venda nova devolve 201. Repetição, duplo clique e F5 nunca criam outra venda.
  - Trava síncrona no botão "Nova venda".
  - Com o comprovante na tela, o botão do topo some; a nova venda passa a ser a ação explícita "Fechar e iniciar nova venda" dentro do comprovante.
- **Situação**: a venda nº 7 **não foi alterada**. Ela pode ser cancelada pela API existente (`POST /vendas/7/cancelar` com `{"confirmar": true}`, como F0001), mediante autorização específica; vazia, não tem pagamentos nem movimentações. Enquanto estiver aberta, a sessão nº 5 não pode ser fechada; ao abrir o PDV, ela é a venda corrente e pode receber itens.

## Guia de utilização (roteiro de apresentação)

1. **Login** com a matrícula. O menu mostra só o que o perfil pode usar; o back-end valida de novo.
2. **Frente de caixa → Sessões de caixa**: abrir o caixa com fundo de troco.
3. **Frente de caixa → PDV**: "Nova venda"; ler ou digitar o código de barras e teclar Enter (cada leitura soma 1, ou a quantidade informada); buscar por nome para produtos a granel; editar quantidade; pedir cancelamento de item com matrícula e senha de outro supervisor.
4. **Ir para pagamento**: compor uma ou mais formas; o rascunho mostra saldo e troco; "Confirmar pagamento" grava tudo numa transação e mostra o comprovante demonstrativo (imprimível).
5. **Relatórios → Dashboard gerencial**: filtros de período e agrupamento; cards, gráficos, estoque, compras, fornecedores, caixas e movimentações.
6. **Estoque / Compras / Catálogo / Administração**: cadastros e consultas para administradores.

## Testes deste script

| Arquivo | Cobre |
| --- | --- |
| `backend/tests/business-time.test.ts` | Virada do dia em Brasília (23:59:59 → 00:00), mesma data comercial no Dashboard e no Estoque/PDV, deslocamento de apresentação, validade sem deslocamento. |
| `backend/tests/sales.test.ts` | Aberturas simultâneas criam uma venda e recuperam a mesma; recuperação após F5 com carrinho preservado; nova venda depois de cancelar. |
| `frontend/src/services/format.test.ts` | DATE sem deslocamento, DATETIME UTC → Brasília (inclusive virada), BRL com milhar e negativo, quantidades UN/KG/L. |

Execução: `npm test` na raiz roda o back-end e o front-end. A verificação visual foi feita no navegador em 1440 × 900, 1366 × 768, 768 × 1024 e 390 × 844.
