/* Renderiza o plano de campanhas (base: lucro da tabela) dentro de root. Dados: data/leads-roi/plan.json */
window.renderPlan = function (P, root) {
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  function R(v) { return brl.format(v); }
  function R2(v) { return brl2.format(v); }
  function N(v) { return nf.format(Math.round(v)); }
  function pc(v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fd(d) { return d.split('-').reverse().join('/'); }
  function cls(v) { return v >= 0 ? 'pos' : 'neg'; }
  function find(rows, name) { for (var i = 0; i < rows.length; i++) if (rows[i].name === name) return rows[i]; return null; }

  var B = P.budget, sc = P.scenarios, picks = P.picks;
  var nTests = P.tests.length;
  var testBudget = P.tests.reduce(function (s, t) { return s + t.budget; }, 0);
  var offPicks = picks.filter(function (p) { return !p.active; });
  var onWeak = P.now.filter(function (n) { return !n.inPlan && n.roi < 60; });
  var onWeakSpend = onWeak.reduce(function (s, n) { return s + n.spendPerDay; }, 0);
  var all = P.creatives.concat(P.avoid);

  var h = '';
  h += '<header><h2 class="plan-title">Plano de Campanhas: ' + R(B) + ' por dia</h2><p class="sub">Base de cálculo: <b>o lucro da tabela</b> (aba "Métricas por anúncio"): receita dos pagantes − gasto − ' + R(P.unitCost) + ' por pedido enviado (pago ou inadimplente) − valor em aberto dos inadimplentes. Período de ' + fd(P.window.start) + ' a ' + fd(P.window.end) + '. O Gerenciador de Anúncios entra só para o gasto diário por anúncio (capacidade de cada criativo e o que está ligado hoje); CPA e compras do Gerenciador não entram em nenhuma decisão.</p></header>';

  // ---------- resumo ----------
  h += '<section><h2>Resumo</h2><div class="grid">' +
    '<div class="kpi"><div class="l">Criativos do plano desligados hoje</div><div class="v">' + offPicks.length + ' de ' + picks.length + '</div><div class="n">Sem gasto na última semana: ' + esc(offPicks.slice(0, 7).map(function (p) { return p.name; }).join(', ')) + (offPicks.length > 7 ? '…' : '') + '.</div></div>' +
    '<div class="kpi"><div class="l">Gasto diário hoje</div><div class="v">' + R(P.nowSpendPerDay) + '</div><div class="n">' + R(onWeakSpend) + ' por dia estão em criativos com ROI abaixo de 60% (' + esc(onWeak.map(function (n) { return n.name; }).join(', ')) + ').</div></div>' +
    '<div class="kpi"><div class="l">Plano</div><div class="v">' + R(P.allocated) + (P.reserve > 0 ? ' + ' + R(P.reserve) : '') + '</div><div class="n">' + picks.length + ' criativos com lucro comprovado' + (P.reserve > 0 ? ' + reserva de testes' : ', sem reserva de testes') + ', em ' + (P.plan.length + nTests) + ' campanhas de até ' + R(P.maxCampaign) + ' por dia.</div></div>' +
    '<div class="kpi"><div class="l">Lucro diário esperado</div><div class="v">' + R(sc[1].profitPerDay) + '</div><div class="n">Se o CPL subir 30% ao escalar (' + R(sc[0].profitPerDay) + ' se não subir; ' + R(sc[2].profitPerDay) + ' se subir 60%). Hoje: cerca de ' + R(P.nowProfitPerDay) + '.</div></div>' +
    '</div>' +
    '<p class="lead">Em uma frase: <b>a maioria dos criativos que mais dão lucro na tabela está desligada, e o dinheiro de hoje está indo para criativos que dão pouco ou perdem.</b> O plano religa os de maior lucro com o orçamento que já provaram aguentar, reparte em campanhas de até ' + R(P.maxCampaign) + ' por dia' + (P.reserve > 0 ? ' e deixa uma reserva para testar criativos novos' : '. Não há reserva de testes: os testes entram depois') + '.</p></section>';

  // ---------- evidências ----------
  h += '<section><h2>O que a tabela mostra</h2>';

  var top3 = ['IMG4', '125', 'IMG6'].map(function (n) { return find(P.creatives, n); }).filter(Boolean);
  var weak4 = ['197', '204', '208', 'C1'].map(function (n) { return find(all, n); }).filter(Boolean);
  h += '<div class="finding"><div><div class="num">1 · QUEM DÁ LUCRO</div><h3>Poucos criativos concentram o lucro, e vários dos maiores gastos mal pagam o anúncio</h3></div>' +
    '<p class="lead">Lucro líquido por criativo na tabela. ' + (top3.length ? esc(top3.map(function (c) { return c.name; }).join(', ')) + ' somam ' + R(top3.reduce(function (s, c) { return s + c.profit; }, 0)) + ' de lucro' : '') +
    (weak4.length ? ', enquanto ' + esc(weak4.map(function (c) { return c.name; }).join(', ')) + ' gastaram ' + R(weak4.reduce(function (s, c) { return s + c.spend; }, 0)) + ' e deixaram ' + R(weak4.reduce(function (s, c) { return s + c.profit; }, 0)) : '') + '.</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Criativo</th><th>Gasto</th><th>Pedidos</th><th>Inadimpl.</th><th>CPL</th><th>Lucro</th><th>ROI</th><th>Hoje</th></tr></thead><tbody>' +
    P.creatives.map(function (c) { return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + R(c.spend) + '</td><td>' + N(c.orders) + '</td><td>' + pc(c.inadRate) + '</td><td>' + R2(c.cpl) + '</td><td class="' + cls(c.profit) + '">' + R(c.profit) + '</td><td class="' + cls(c.roi) + '">' + pc(c.roi) + '</td><td><span class="pill ' + (c.active ? 'on' : 'off') + '">' + (c.active ? 'ligado' : 'desligado') + '</span></td></tr>'; }).join('') +
    '</tbody></table></div></div>';

  h += '<div class="finding"><div><div class="num">2 · O QUE ESTÁ LIGADO</div><h3>O gasto de hoje está nos criativos de menor lucro</h3></div>' +
    '<p class="lead">Gasto diário dos últimos 7 dias (Gerenciador) com o lucro da tabela de cada criativo. O "teto de CPL" é o maior CPL que ainda mantém ROI de 100%.</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Ligado hoje</th><th>Gasto/dia</th><th>CPL</th><th>Teto de CPL</th><th>ROI</th><th>Inadimpl.</th><th>No plano?</th></tr></thead><tbody>' +
    P.now.map(function (n) { return '<tr><td><b>' + esc(n.name) + '</b></td><td>' + R(n.spendPerDay) + '</td><td>' + R2(n.cpl) + '</td><td class="' + (n.cpl <= n.cplCeil ? '' : 'neg') + '">' + R2(n.cplCeil) + '</td><td class="' + cls(n.roi) + '">' + pc(n.roi) + '</td><td>' + pc(n.inadRate) + '</td><td>' + (n.inPlan ? 'sim' : '<span class="neg">não</span>') + '</td></tr>'; }).join('') +
    '</tbody></table></div></div>';

  function campRow(c) {
    var roi = c.profit / c.spend * 100;
    return '<tr><td class="wrap-cell"><b>' + esc(c.name) + '</b><div class="small">' + esc(c.ads.join(', ')) + '</div></td><td>' + R(c.spend) + '</td><td class="' + cls(roi) + '">' + pc(roi) + '</td><td>' + pc(c.inadRate) + '</td></tr>';
  }
  h += '<div class="finding"><div><div class="num">3 · COMBINAÇÕES DE CRIATIVOS</div><h3>As campanhas que perderam dinheiro misturaram campeões com criativos de muita inadimplência</h3></div>' +
    '<p class="lead">Lucro por campanha com o custo real de cada uma (planilha "Custo campanhas"); só entram campanhas com custo coerente com os leads. As piores juntam um criativo bom (IMG4, IMG9, IMG7) com criativos das séries C e V, que têm de 20% a 36% de pedidos inadimplentes no CRM: o orçamento também vai para os fracos. As melhores têm inadimplência baixa.</p>' +
    '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr))">' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Melhores campanhas</th><th>Gasto</th><th>ROI</th><th>Inad.</th></tr></thead><tbody>' + P.bestCampaigns.map(campRow).join('') + '</tbody></table></div>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Piores campanhas</th><th>Gasto</th><th>ROI</th><th>Inad.</th></tr></thead><tbody>' + P.worstCampaigns.map(campRow).join('') + '</tbody></table></div></div></div>';

  h += '<div class="finding"><div><div class="num">4 · ESTRUTURA DA CAMPANHA</div><h3>A estrutura pesa menos do que quais criativos entram na campanha</h3></div>' +
    '<p class="lead">ROI e inadimplência por estrutura (campanhas-conjuntos-anúncios no nome), com o custo real de cada campanha, sem descontar o mix de criativos:</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Estrutura</th><th>Campanhas</th><th>Gasto</th><th>CPL</th><th>Conversão</th><th>Inadimpl.</th><th>ROI</th></tr></thead><tbody>' +
    P.structures.map(function (s) { return '<tr><td><b>' + esc(s.structure) + '</b></td><td>' + s.campaigns + '</td><td>' + R(s.spend) + '</td><td>' + R2(s.cpl) + '</td><td>' + pc(s.conv, 1) + '</td><td>' + pc(s.inadRate) + '</td><td class="' + cls(s.roi) + '">' + pc(s.roi) + '</td></tr>'; }).join('') +
    '</tbody></table></div><p class="small">1-4-1 tem só 4 campanhas. As demais ficam parecidas: as que usam criativos de alta inadimplência perdem mesmo nas estruturas boas. O plano usa um conjunto por criativo porque define um valor por criativo, e com conjuntos separados você controla esse valor.</p></div>';

  h += '<div class="finding"><div><div class="num">5 · FOLGA</div><h3>Há folga de CPL antes de o ROI cair abaixo de 100%, mas ela varia muito entre os criativos</h3></div>' +
    '<p class="lead">Teto de CPL = lucro por lead antes do anúncio ÷ 2. Passando do teto, o ROI líquido fica abaixo de 100%. Por isso o plano usa rampa e regra de parada.</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Criativo</th><th>CPL atual</th><th>Teto de CPL (ROI 100%)</th><th>CPL de equilíbrio (lucro zero)</th><th>Folga até o teto</th></tr></thead><tbody>' +
    picks.slice(0, 8).map(function (p) { return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + R2(p.cpl) + '</td><td>' + R2(p.cplCeil) + '</td><td>' + R2(p.contribLead) + '</td><td class="pos">' + pc((p.cplCeil / p.cpl - 1) * 100) + '</td></tr>'; }).join('') +
    '</tbody></table></div></div></section>';

  // ---------- plano ----------
  h += '<section><h2>Campanhas: ' + R(B) + ' por dia</h2>' +
    '<p class="lead">Cada criativo recebe uma parte da <b>capacidade já provada</b>: o maior gasto diário médio de uma semana em que ele rodou. A parte depende de pedidos (300+ pleno, 80 a 299 com 80%), ROI da tabela (150% ou mais pleno, 100% a 150% metade) e sinais de desgaste ou inadimplência acima de 10% (80%). Nenhum criativo passa de 14% do total.' + (P.reserve === 0 ? ' O que sobrou depois da parte de cada criativo foi para quem tem maior ROI, de R$ 50 em R$ 50, sem passar da capacidade já provada; criativos com amostra pequena (IMG3 e IMG33, por exemplo) entram com metade da capacidade.' : '') + ' Nenhuma campanha passa de ' + R(P.maxCampaign) + ' por dia: no Gerenciador, o CPA da conta sobe de R$ 155 (R$ 1,5 a 3 mil por dia) para R$ 177 (R$ 3 a 6 mil) e R$ 197 (acima de R$ 6 mil). Escalar é abrir mais campanhas.</p>';
  function crRow(it) {
    var p = find(picks, it.name);
    var why = p.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
    return '<div class="cr"><div><div class="name">' + esc(p.name) + '</div><div class="amt tab">' + R(it.budget) + '/dia</div><div class="small"><span class="pill ' + (p.active ? 'on' : 'off') + '">' + (p.active ? 'ligado' : 'desligado hoje') + '</span></div></div>' +
      '<div><ul>' + why + '</ul><div class="facts tab"><span>CPL atual ' + R2(p.cpl) + '</span><span>teto ' + R2(p.cplCeil) + '</span><span>capacidade provada ' + R(p.peakDaily) + '/dia</span><span>lucro no período ' + R(p.profit) + '</span><span>ativo de ' + fd(p.first) + ' a ' + fd(p.last) + '</span></div></div></div>';
  }
  P.plan.forEach(function (c) {
    h += '<div class="campaign"><header><div><h3>' + esc(c.name) + '</h3><div class="small">Estrutura ' + esc(c.structure) + ' · CBO · um conjunto por criativo · WhatsApp final ' + esc(c.whatsapp) + '</div></div><div class="budget tab">' + R(c.budget) + '/dia</div></header><p class="goal">' + esc(c.goal) + '</p>' + c.items.map(crRow).join('') + '</div>';
  });
  if (P.tests.length) {
    h += '<div class="campaign"><header><div><h3>' + (P.tests.length > 1 ? 'Campanhas de teste (' + P.tests.length + ')' : esc(P.tests[0].name)) + '</h3><div class="small">CBO · até ' + R(P.maxCampaign) + ' por dia cada</div></div><div class="budget tab">' + R(testBudget) + '/dia</div></header>' +
      '<p class="goal">Reserva de ' + pc(testBudget / B * 100) + ' do orçamento para validar o que ainda não tem volume e criar o próximo campeão. Testes em ABO ficaram bem piores no Gerenciador (CPA de R$ 233 contra R$ 159 no CBO), então rode os testes em CBO.</p>' +
      P.test.items.map(function (t) {
        return '<div class="cr"><div><div class="name">' + esc(t.name) + '</div><div class="amt tab">' + R(t.budget) + '/dia</div></div><div><ul><li>ROI de ' + pc(t.roi) + ' e ' + pc(t.inadRate) + ' de inadimplência na tabela, mas só ' + N(t.orders) + ' pedidos e ' + R(t.spend) + ' de gasto: amostra pequena para escalar.</li><li>Sobe aos poucos; se confirmar com mais volume, passa para uma campanha de escala.</li></ul></div></div>';
      }).join('') +
      '<div class="cr"><div><div class="name">Novas variações</div><div class="amt tab">' + R(P.test.newVariants) + '/dia</div></div><div><ul><li>Criativos novos no formato dos de maior lucro (IMG4, 125, IMG6, IMG7): mesma promessa, imagem e texto diferentes.</li><li>Cada um com R$ 200 a R$ 300 por dia por 3 a 4 dias. O que bater o teto de CPL e converter acima de 8% sobe para a campanha de escala.</li></ul></div></div></div>';
  }
  h += '<p class="small">Soma: ' + R(P.allocated) + ' nos criativos com lucro comprovado' + (testBudget > 0 ? ' + ' + R(testBudget) + ' em testes = ' + R(P.allocated + testBudget) : '') + '.</p></section>';

  // ---------- como colocar no ar ----------
  var champs = P.plan.filter(function (c) { return c.group === 'Campeões'; }).reduce(function (a, c) { return a.concat(c.items.map(function (i) { return i.name; })); }, []);
  h += '<section><h2>Como colocar no ar</h2><p class="lead">Não suba tudo de uma vez: os preços do leilão mudam com o orçamento, e os de maior lucro estão parados há semanas.</p><div class="steps">' +
    '<div class="step"><b>Dias 1 a 3</b><p>50% do orçamento de cada criativo (' + R(B / 2) + ' no total). Religue primeiro as campanhas "Campeões" (' + esc(champs.join(', ')) + ').</p></div>' +
    '<div class="step"><b>Dias 4 a 6</b><p>75%, só nos criativos com CPL abaixo do teto. Quem passar do teto por 2 dias seguidos volta a 50%.</p></div>' +
    '<div class="step"><b>Dia 7 em diante</b><p>100% do plano. A cada semana, troque os criativos com a conversão em queda por criativos novos' + (P.reserve > 0 ? ' que vieram dos testes' : '') + '.</p></div>' +
    '<div class="step"><b>Regra de parada</b><p>CPL acima do teto por 3 dias: reduza 30%. CPL acima do equilíbrio (lucro zero): pause o conjunto.</p></div></div>' +
    '<div class="notice"><b>Atenção à inadimplência.</b> Ela só aparece semanas depois do envio. Nos primeiros dias o ROI parece melhor do que é. Confira, na aba de métricas, a inadimplência dos pedidos de 3 semanas atrás antes de aumentar a escala: se algum criativo passar de 20%, reduza.</div></section>';

  // ---------- desligar ----------
  h += '<section><h2>O que desligar ou não reativar</h2><p class="lead">Estes criativos têm gasto alto e ROI baixo ou negativo na tabela, ou inadimplência acima de 15%. Retirar o orçamento deles financia o plano.</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Criativo</th><th>Gasto no período</th><th>Lucro</th><th>ROI</th><th>Inadimpl.</th><th>Hoje</th></tr></thead><tbody>' +
    P.avoid.map(function (c) { return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + R(c.spend) + '</td><td class="' + cls(c.profit) + '">' + R(c.profit) + '</td><td class="' + cls(c.roi) + '">' + pc(c.roi) + '</td><td>' + pc(c.inadRate) + '</td><td><span class="pill ' + (c.active ? 'on' : 'off') + '">' + (c.active ? 'ligado' : 'desligado') + '</span></td></tr>'; }).join('') +
    '</tbody></table></div></section>';

  // ---------- resultado ----------
  h += '<section><h2>Resultado esperado e limites</h2><div class="scroll"><table class="tab"><thead><tr><th>Cenário</th><th>Lucro por dia</th><th>Lucro em 30 dias</th></tr></thead><tbody>' +
    sc.map(function (s) { var label = s.cplFactor === 1 ? 'CPL igual ao histórico' : 'CPL ' + pc((s.cplFactor - 1) * 100) + ' maior'; return '<tr><td>' + label + '</td><td class="' + cls(s.profitPerDay) + '">' + R(s.profitPerDay) + '</td><td class="' + cls(s.profitPerDay) + '">' + R(s.profitPerDay * 30) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<p class="lead">Projeção com o orçamento dos criativos do plano e cerca de ' + N(P.expected.leads) + ' leads e ' + N(P.expected.orders) + ' pedidos por dia. ' + (P.reserve > 0 ? 'A reserva de testes entra com lucro zero.' : 'Não há reserva de testes no plano.') + '</p>' +
    '<ul class="plain">' +
    '<li><b>Os melhores do passado tendem a render menos.</b> Escolhi pelos melhores resultados, e parte do sucesso foi sorte e época. Trate o cenário de CPL 30% maior como o realista e o de 60% como o pessimista.</li>' +
    '<li><b>Capacidade provada não é teto garantido.</b> É o maior gasto diário que o criativo já teve numa semana. Vários criativos parecidos no ar ao mesmo tempo podem saturar o público.</li>' +
    '<li><b>O custo por campanha tem cobertura parcial.</b> Cerca de 10% dos leads estão em campanhas cujo nome no CRM difere do nome no Meta; nelas o ROI da campanha não é calculado. O ROI por criativo é direto.</li>' +
    '<li><b>Vendas recentes ainda não amadureceram.</b> A conversão usa os leads até ' + fd(P.window.matureEnd) + ' nas comparações de tendência.</li>' +
    '<li><b>Por que os criativos foram desligados é desconhecido.</b> Se foi desgaste, a volta pode render menos; por isso começa com 50%.</li></ul></section>';

  // ---------- criativos usados ----------
  var campsOf = {};
  P.plan.forEach(function (c) { c.items.forEach(function (it) { (campsOf[it.name] = campsOf[it.name] || []).push(c.name.replace(/^Campanha (\d+) · .*$/, 'Campanha $1')); }); });
  var usedTotal = picks.reduce(function (s, p) { return s + p.budget; }, 0);
  h += '<section><h2>Criativos usados no plano (' + picks.length + ')</h2><p class="lead">Todos os criativos que recebem orçamento, do maior para o menor, com o lucro da tabela de cada um.</p>' +
    '<div class="scroll"><table class="tab"><thead><tr><th>Criativo</th><th>Orçamento/dia</th><th>% do plano</th><th>Campanha</th><th>Lucro</th><th>ROI</th><th>Pedidos</th><th>Inadimpl.</th><th>CPL</th><th>Hoje</th></tr></thead><tbody>' +
    picks.slice().sort(function (a, b) { return b.budget - a.budget; }).map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + R(p.budget) + '</td><td>' + pc(p.budget / usedTotal * 100, 1) + '</td><td>' + esc((campsOf[p.name] || []).join(', ')) + '</td><td class="' + cls(p.profit) + '">' + R(p.profit) + '</td><td class="' + cls(p.roi) + '">' + pc(p.roi) + '</td><td>' + N(p.orders) + '</td><td>' + pc(p.inadRate) + '</td><td>' + R2(p.cpl) + '</td><td><span class="pill ' + (p.active ? 'on' : 'off') + '">' + (p.active ? 'ligado' : 'desligado') + '</span></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td><b>Total</b></td><td><b>' + R(usedTotal) + '</b></td><td><b>100%</b></td><td colspan="7"></td></tr></tfoot></table></div></section>';

  root.innerHTML = '<div id="plan-inner" style="display:flex;flex-direction:column;gap:36px;min-width:0">' + h + '</div>';
};
