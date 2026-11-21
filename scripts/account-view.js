/* Renderiza a análise da conta (base: Compras na Meta) dentro de root. Dados: data/account-analysis/analysis.json */
window.renderAccount = function (A, root) {
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  function R(v) { return v == null ? '—' : brl.format(v); }
  function N(v) { return nf.format(Math.round(v)); }
  function pc(v, d) { return v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + '%'; }
  function sg(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%'; }
  function dec(v, d) { return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fd(d) { return d.split('-').reverse().join('/'); }
  function mlabel(m) { var p = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+p[1] - 1] + '/' + p[0].slice(2); }
  function vcls(v) { return v == null ? '' : v <= -5 ? 'good' : v >= 5 ? 'bad' : ''; }
  function icls(v) { return v == null ? '' : v >= 1.05 ? 'good' : v <= 0.95 ? 'bad' : ''; }
  var STATUS = { ACTIVE: 'ativa', PAUSED: 'pausada', ARCHIVED: 'arquivada', CAMPAIGN_PAUSED: 'pausada', ADSET_PAUSED: 'pausada', WITH_ISSUES: 'com problema', IN_PROCESS: 'em análise', DELETED: 'excluída' };
  function st(s) { return STATUS[s] || (s ? s.toLowerCase() : '—'); }
  function find(rows, test) { for (var i = 0; i < rows.length; i++) if (test(rows[i])) return rows[i]; return null; }
  function sumCpa(rows) { var s = 0, p = 0; rows.forEach(function (r) { s += r.spend; p += r.purchases; }); return p ? s / p : null; }

  function table(rows, labelHead, hasIndex) {
    var h = '<div class="scroll"><table class="tab"><thead><tr><th>' + labelHead + '</th><th>Gasto</th><th>% do gasto</th><th>Compras na Meta</th><th>CPA</th><th>CPA vs conta</th>' + (hasIndex ? '<th>Índice no mês</th><th>Campanhas</th>' : '<th>Itens</th>') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.label) + '</b></td><td>' + R(r.spend) + '</td><td>' + pc(r.share * 100, 1) + '</td><td>' + N(r.purchases) + '</td><td>' + R(r.cpa) + '</td><td class="' + vcls(r.vsAvg) + '">' + sg(r.vsAvg) + '</td>' +
        (hasIndex ? '<td class="' + icls(r.index) + '">' + dec(r.index, 2) + '</td><td>' + (r.n == null ? '—' : r.n) + '</td>' : '<td>' + (r.n == null ? '—' : r.n) + '</td>') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function block(title, lead, rows, labelHead, hasIndex, note) {
    return '<div class="finding"><h3>' + title + '</h3>' + (lead ? '<p class="lead">' + lead + '</p>' : '') + table(rows, labelHead, hasIndex) + (note ? '<p class="small">' + note + '</p>' : '') + '</div>';
  }

  var T = A.types, C = A.curves, B = A.breakdowns, acc = A.account;
  var opt = find(T.optimizationGoal, function (r) { return r.label === 'OFFSITE_CONVERSIONS'; });
  var cbo = find(T.budgetType, function (r) { return /^CBO/.test(r.label); });
  var abo = find(T.budgetType, function (r) { return /^ABO/.test(r.label); });
  var adv = find(T.advantage, function (r) { return /Advantage/.test(r.label); });
  var man = find(T.advantage, function (r) { return /manual/.test(r.label); });
  var vid = find(T.creativeType, function (r) { return r.label === 'Vídeo'; });
  var img = find(T.creativeType, function (r) { return /SHARE/.test(r.label); });
  var bandMid = find(C.budgetBands, function (r) { return /^c\)/.test(r.label); });
  var bandHigh = find(C.budgetBands, function (r) { return /^e\)/.test(r.label); });
  var bandMid2 = find(C.budgetBands, function (r) { return /^d\)/.test(r.label); });
  var young = find(C.ageBands, function (r) { return /^a\)/.test(r.label); });
  var matureCpa = sumCpa(C.ageBands.filter(function (r) { return /^[b-e]\)/.test(r.label); }));
  var mon = find(C.weekdays, function (r) { return r.label === 'seg'; });
  var sun = find(C.weekdays, function (r) { return r.label === 'dom'; });
  var sp = find(B.regions, function (r) { return r.label === 'São Paulo'; });
  var rj = find(B.regions, function (r) { return r.label === 'Rio de Janeiro'; });
  var cheap = B.regions.filter(function (r) { return r.cpa != null && r.vsAvg <= -10; });
  var old65 = find(B.ageGender, function (r) { return /^65\+/.test(r.label); });
  var famIMG = find(T.creativeFamilies, function (r) { return r.label === 'IMG'; });
  var famV = find(T.creativeFamilies, function (r) { return r.label === 'V'; });
  var famB = find(T.creativeFamilies, function (r) { return r.label === 'B'; });
  var cr125 = find(A.creatives, function (c) { return c.name === '125'; });
  var crIMG4 = find(A.creatives, function (c) { return c.name === 'IMG4'; });
  var bestCreatives = A.creatives.slice(0, 10);
  var worstCreatives = A.creatives.slice(-8).reverse();
  var lastMonth = A.monthly[A.monthly.length - 1];
  var outages = A.outage ? A.outage.runs : [];
  // As maiores campanhas ativas agora: faixa de CPA para o texto.
  var activeNow = A.now.campaigns.filter(function (c) { return c.status === 'ACTIVE' && c.cpa; }).slice(0, 4);
  var activeMin = Math.min.apply(null, activeNow.map(function (c) { return c.cpa; })), activeMax = Math.max.apply(null, activeNow.map(function (c) { return c.cpa; }));

  var h = '';
  h += '<div class="notice"><b>Esta aba usa os dados do Gerenciador de Anúncios (compras na Meta e CPA).</b> Ela serve para entender a conta e o rastreio. Quem dá lucro, e portanto as decisões sobre criativos e campanhas e o plano de orçamento, vêm da tabela da aba "Métricas por anúncio" (receita e inadimplência do CRM) e não desta.</div>';
  h += '<header><h2 class="acc-title">Análise da conta · Compras na Meta</h2><p class="sub">Conta BR 4, de ' + fd(A.window.start) + ' a ' + fd(A.window.end) + '. Todos os cálculos usam as <b>compras na Meta</b> (a coluna “Compras na Meta” das planilhas do Meta). CPA = gasto ÷ compras na Meta. O valor de compra que a Meta registra não é usado: desde março ele vem multiplicado por 100.</p></header>';

  // ---------- números ----------
  h += '<section><div class="grid">' +
    '<div class="kpi"><div class="l">Gasto em 2026</div><div class="v">' + R(acc.spend) + '</div><div class="n">' + N(acc.campaigns) + ' campanhas, ' + N(acc.adsets) + ' conjuntos, ' + N(acc.ads) + ' anúncios</div></div>' +
    '<div class="kpi"><div class="l">Compras na Meta</div><div class="v">' + N(acc.purchases) + '</div><div class="n">CPA médio de ' + R(acc.cpa) + '</div></div>' +
    '<div class="kpi"><div class="l">CPA em ' + mlabel(lastMonth.month) + ' (parcial)</div><div class="v ' + (lastMonth.cpa > acc.cpa * 1.1 ? 'bad' : '') + '">' + R(A.now.cpa) + '</div><div class="n">de ' + fd(A.now.from) + ' a ' + fd(A.now.to) + ', ' + N(A.now.purchases) + ' compras. Os últimos dias ainda estão incompletos.</div></div>' +
    (A.outage ? '<div class="kpi"><div class="l">Gasto sem compra reportada</div><div class="v bad">' + R(A.outage.spend) + '</div><div class="n">' + A.outage.days + ' dias com gasto alto e quase nenhuma compra (falha de rastreio)</div></div>' : '') +
    '</div></section>';

  // ---------- resumo ----------
  h += '<section><h2>Resumo: o que funciona e o que não funciona</h2><div class="recs">' +
    '<div class="rec"><div class="n">1</div><div><h3>A conta é quase um tipo só, então quase nada de “tipo” muda o CPA</h3><p>' + pc(opt.share * 100, 1) + ' do gasto está em campanhas de vendas que otimizam compra com destino WhatsApp; ' + pc(cbo.spend / (cbo.spend + abo.spend) * 100, 0) + ' em CBO; quase 100% em mulheres. Público aberto (Advantage+) e manual têm CPA parecido (' + R(adv.cpa) + ' e ' + R(man.cpa) + '), e os posicionamentos ficam a menos de 5% um do outro.</p></div></div>' +
    '<div class="rec"><div class="n">2</div><div><h3>O que mais move o CPA é o criativo</h3><p>O CPA vai de ' + R(A.creatives[0].cpa) + ' (' + esc(A.creatives[0].name) + ') a ' + R(A.creatives[A.creatives.length - 1].cpa) + ' (' + esc(A.creatives[A.creatives.length - 1].name) + ') entre criativos com gasto relevante. O criativo ' + esc(cr125 ? cr125.name : '125') + ' tem ' + N(cr125 ? cr125.purchases : 0) + ' compras a ' + R(cr125 ? cr125.cpa : null) + ' (' + sg(cr125 ? cr125.vsAvg : null) + ' contra a média) e hoje não tem nenhum anúncio ativo.</p></div></div>' +
    '<div class="rec"><div class="n">3</div><div><h3>Orçamento: escale com mais campanhas, não com mais verba por campanha</h3><p>Campanhas entre R$ 1.500 e R$ 3.000 por dia tiveram CPA de ' + R(bandMid.cpa) + '. Acima de R$ 3.000 o CPA sobe para ' + R(bandMid2.cpa) + ' e, acima de R$ 6.000, para ' + R(bandHigh.cpa) + ' (' + sg((bandHigh.cpa / bandMid.cpa - 1) * 100) + ' contra a faixa ideal).</p></div></div>' +
    '<div class="rec"><div class="n">4</div><div><h3>Os 3 primeiros dias de uma campanha são os piores</h3><p>Nos dias 1 a 3 o CPA é ' + R(young.cpa) + ', contra ' + R(matureCpa) + ' dos dias 4 a 60 (' + sg((young.cpa / matureCpa - 1) * 100) + '). Julgar uma campanha antes do 5º dia mata campanhas boas.</p></div></div>' +
    '<div class="rec"><div class="n">5</div><div><h3>Hoje a conta está pior que a média, e o que roda é o mais fraco</h3><p>De ' + fd(A.now.from) + ' a ' + fd(A.now.to) + ' o CPA é ' + R(A.now.cpa) + ' contra ' + R(acc.cpa) + ' no ano. As maiores campanhas ativas rodam V23, V43, B36 e B39, com CPA de ' + R(activeMin) + ' a ' + R(activeMax) + ', enquanto os criativos de menor CPA estão desligados.</p></div></div>' +
    (outages.length ? '<div class="rec"><div class="n">6</div><div><h3>O rastreio de compras caiu duas vezes</h3><p>' + outages.map(function (o) { return 'De ' + fd(o.from) + ' a ' + fd(o.to) + ' foram ' + R(o.spend) + ' gastos com ' + N(o.purchases) + ' compra(s) reportada(s)'; }).join('; ') + '. Sem compras chegando, a Meta otimiza às cegas, e esses dias distorcem o CPA de quem rodava então.</p></div></div>' : '') +
    '</div></section>';

  // ---------- tipos ----------
  h += '<section><h2>Tipos de campanha</h2>' +
    '<p class="lead">Cada tabela compara o CPA de cada grupo com o da conta (' + R(acc.cpa) + '). “Índice no mês” compara as compras reais com as esperadas pelo CPA da conta no mesmo mês (acima de 1 é melhor que a conta), o que tira o efeito da época. Valores abaixo de 5% de diferença não são sinal.</p>' +
    block('Meta de otimização do conjunto', 'Praticamente tudo é “compras” via WhatsApp. As outras metas foram testes pequenos.', T.optimizationGoal, 'Meta de otimização', false) +
    block('Onde fica o orçamento: CBO ou ABO', 'ABO (testes) custa bem mais por compra que CBO.', T.budgetType, 'Tipo de orçamento', true) +
    block('Estrutura (campanhas-conjuntos-anúncios no nome da campanha)', 'Ex.: 1-3-1 = 3 conjuntos com 1 anúncio; 1-1-7 = 1 conjunto com 7 anúncios. 1-4-1, 1-1-7 e 1-5-1 ficam acima da conta; 1-3-1, 1-1-5 e 1-10-1, abaixo. As diferenças são moderadas e há poucas campanhas em algumas estruturas.', T.structure, 'Estrutura', true) +
    '<div class="two">' + block('Público: Advantage+ x manual', '', T.advantage, 'Público', false) + block('Faixa etária alvo', '', T.audienceAge, 'Faixa alvo', false) + '</div>' +
    block('Número de WhatsApp do conjunto (final)', 'Nenhum número é claramente melhor na Meta.', T.whatsapp, 'WhatsApp', false) +
    '<div class="two">' + block('Formato do criativo', 'Imagem custa menos para alcançar (CPM menor) e converte a um CPA ' + sg(img ? img.vsAvg : null) + ' contra a conta.', T.creativeType, 'Formato', false) +
    block('Família do criativo (prefixo do nome)', 'IMG e numerados são os melhores; V e B, os mais recentes, são os piores.', T.creativeFamilies, 'Família', false) + '</div>' +
    block('Criativos por mês de criação do anúncio', 'Os anúncios criados em março e abril tiveram os menores CPAs. Desde maio, o CPA dos novos anúncios ficou cerca de 20% acima.', T.createdMonthCohort, 'Mês de criação', false) +
    '</section>';

  // ---------- escala e vida ----------
  h += '<section><h2>Escala, vida da campanha e calendário</h2>' +
    block('Quanto a campanha gasta por dia', 'Cada linha de dia de campanha entra na faixa do que ela gastou naquele dia. A faixa de até R$ 700 tem CPA baixo, mas é cauda de campanhas em fim de vida e testes pequenos.', C.budgetBands, 'Gasto da campanha no dia', true) +
    block('Idade da campanha', 'Dias desde o primeiro gasto.', C.ageBands, 'Idade', true) +
    block('Dia da semana', 'Segunda-feira é o melhor dia e domingo o pior.', C.weekdays, 'Dia', true) +
    '<p class="lead">As ' + N(A.waste.lifespan.campaigns) + ' campanhas que gastaram mais de R$ 30 mil tiveram gasto em ' + A.waste.lifespan.median + ' dias (mediana; metade ficou entre ' + A.waste.lifespan.p25 + ' e ' + A.waste.lifespan.p75 + ' dias). As campanhas grandes duram cerca de 5 semanas, então vale ter o próximo criativo pronto antes.</p></section>';

  // ---------- público e posicionamento ----------
  h += '<section><h2>Público, posicionamento e região</h2>' +
    '<div class="two">' + block('Idade e gênero', '', B.ageGender, 'Idade', false) + block('Posicionamento', 'Nenhum posicionamento passa de 5% de diferença: não vale separar.', B.placements, 'Posicionamento', false) + '</div>' +
    block('Estado', 'São Paulo e Rio de Janeiro somam ' + pc(((sp ? sp.share : 0) + (rj ? rj.share : 0)) * 100, 0) + ' do gasto com CPA de ' + R(sp ? sp.cpa : null) + ' e ' + R(rj ? rj.cpa : null) + '. ' + cheap.map(function (r) { return r.label; }).join(', ') + ' ficam mais de 10% abaixo da média.', B.regions, 'Estado', false, 'Esta tabela mostra os estados com mais gasto; a conta tem ' + B.regionAll + ' regiões. A Meta só vê o CPA: ticket e inadimplência por estado não aparecem aqui.') +
    '</section>';

  // ---------- criativos ----------
  function crTable(rows) {
    var t = '<div class="scroll"><table class="tab"><thead><tr><th>Criativo</th><th>Gasto</th><th>Compras na Meta</th><th>CPA</th><th>CPA vs conta</th><th>Anúncios</th><th>Ativos hoje</th><th>Formato</th></tr></thead><tbody>';
    rows.forEach(function (c) { t += '<tr><td><b>' + esc(c.name) + '</b></td><td>' + R(c.spend) + '</td><td>' + N(c.purchases) + '</td><td>' + R(c.cpa) + '</td><td class="' + vcls(c.vsAvg) + '">' + sg(c.vsAvg) + '</td><td>' + c.ads + '</td><td>' + (c.active ? '<span class="pill on">' + c.active + '</span>' : '<span class="pill off">0</span>') + '</td><td>' + esc(c.type) + '</td></tr>'; });
    return t + '</tbody></table></div>';
  }
  h += '<section><h2>Criativos</h2><p class="lead">Criativos com ao menos R$ 30 mil de gasto e 50 compras na Meta em 2026, com variações do mesmo nome somadas (por exemplo 125 e 5). O CPA inclui os dias de falha de rastreio.</p>' +
    '<div class="finding"><h3>Menores CPAs</h3>' + crTable(bestCreatives) + '</div>' +
    '<div class="finding"><h3>Maiores CPAs</h3>' + crTable(worstCreatives) + '</div></section>';

  // ---------- campanhas ----------
  function cTable(rows) {
    var t = '<div class="scroll"><table class="tab"><thead><tr><th>Campanha</th><th>Status</th><th>Gasto</th><th>Compras na Meta</th><th>CPA</th><th>CPA vs conta</th><th>Dias</th></tr></thead><tbody>';
    rows.forEach(function (c) { t += '<tr><td class="wrap-cell"><b>' + esc(c.name) + '</b></td><td>' + st(c.status) + '</td><td>' + R(c.spend) + '</td><td>' + N(c.purchases) + '</td><td>' + R(c.cpa) + '</td><td class="' + vcls(c.vsAvg) + '">' + sg(c.vsAvg) + '</td><td>' + c.days + '</td></tr>'; });
    return t + '</tbody></table></div>';
  }
  h += '<section><h2>Campanhas</h2><p class="lead">Desde março, campanhas com ao menos R$ 20 mil de gasto e 150 compras na Meta, sem os dias de falha de rastreio. Quase todas as melhores estão arquivadas.</p>' +
    '<div class="finding"><h3>Menores CPAs</h3>' + cTable(A.campaignsBest) + '</div>' +
    '<div class="finding"><h3>Maiores CPAs</h3>' + cTable(A.campaignsWorst) + '</div>' +
    '<div class="finding"><h3>O que está rodando agora (' + fd(A.now.from) + ' a ' + fd(A.now.to) + ')</h3><div class="scroll"><table class="tab"><thead><tr><th>Campanha</th><th>Status</th><th>Orçamento/dia</th><th>Gasto</th><th>Compras na Meta</th><th>CPA</th></tr></thead><tbody>' +
    A.now.campaigns.map(function (c) { return '<tr><td class="wrap-cell"><b>' + esc(c.name) + '</b></td><td>' + st(c.status) + '</td><td>' + R(c.budget) + '</td><td>' + R(c.spend) + '</td><td>' + N(c.purchases) + '</td><td class="' + (c.cpa && c.cpa > acc.cpa * 1.2 ? 'bad' : '') + '">' + R(c.cpa) + '</td></tr>'; }).join('') +
    '</tbody></table></div><p class="small">As compras dos últimos dias ainda estão chegando, então o CPA recente tende a parecer pior do que será.</p></div></section>';

  // ---------- evolução ----------
  h += '<section><h2>Evolução</h2><div class="two">' +
    '<div class="finding"><h3>Por mês</h3><div class="scroll"><table class="tab"><thead><tr><th>Mês</th><th>Gasto</th><th>Compras na Meta</th><th>CPA</th></tr></thead><tbody>' +
    A.monthly.map(function (m) { return '<tr><td><b>' + mlabel(m.month) + '</b></td><td>' + R(m.spend) + '</td><td>' + N(m.purchases) + '</td><td class="' + (m.cpa <= acc.cpa * 0.95 ? 'good' : m.cpa >= acc.cpa * 1.05 ? 'bad' : '') + '">' + R(m.cpa) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
    '<div class="finding"><h3>Por semana (segunda-feira)</h3><div class="scroll"><table class="tab"><thead><tr><th>Semana</th><th>Gasto</th><th>Compras na Meta</th><th>CPA</th></tr></thead><tbody>' +
    A.weekly.map(function (w) { return '<tr><td><b>' + fd(w.week) + '</b></td><td>' + R(w.spend) + '</td><td>' + N(w.purchases) + '</td><td class="' + (w.cpa == null ? '' : w.cpa <= acc.cpa * 0.95 ? 'good' : w.cpa >= acc.cpa * 1.05 ? 'bad' : '') + '">' + R(w.cpa) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
    '<p class="small">A semana de 03/08 mostra o efeito da falha de rastreio de 1 a 6 de agosto. Em novembro e na última semana, as compras ainda estão chegando.</p></section>';

  // ---------- o que fazer ----------
  var avoidNames = ['V23', 'V43', 'B36', 'B39'];
  var cr = function (n) { return find(A.creatives, function (c) { return c.name === n; }); };
  h += '<section><h2>O que fazer</h2><div class="recs">' +
    '<div class="rec"><div class="n">1</div><div><h3>Religar os criativos de menor CPA</h3><p>' + esc(bestCreatives.slice(0, 6).map(function (c) { return c.name + ' (' + R(c.cpa) + ')'; }).join(', ')) + '. Nenhum deles tem anúncio ativo hoje, exceto ' + esc(crIMG4 ? crIMG4.name : 'IMG4') + '. Comece com 50% do orçamento e suba em 3 a 4 dias.</p></div></div>' +
    '<div class="rec"><div class="n">2</div><div><h3>Desligar V23, V43, B36 e B39</h3><p>São as maiores campanhas ativas e custam de ' + R(activeMin) + ' a ' + R(activeMax) + ' por compra em novembro. Os B têm o pior CPA entre as famílias (' + R(famB ? famB.cpa : null) + ') e os V também (' + R(famV ? famV.cpa : null) + '), contra ' + R(famIMG ? famIMG.cpa : null) + ' das imagens IMG.</p></div></div>' +
    '<div class="rec"><div class="n">3</div><div><h3>Escalar com mais campanhas de R$ 1.500 a R$ 3.000 por dia</h3><p>Nada de campanha acima de R$ 3.000 por dia: o CPA sobe de ' + R(bandMid.cpa) + ' para ' + R(bandMid2.cpa) + ' e chega a ' + R(bandHigh.cpa) + ' acima de R$ 6.000. Para R$ 20 mil por dia, são 7 a 10 campanhas.</p></div></div>' +
    '<div class="rec"><div class="n">4</div><div><h3>Decidir só a partir do 5º dia</h3><p>Os dias 1 a 3 custam ' + sg((young.cpa / matureCpa - 1) * 100) + ' a mais por compra. Pause só quem continuar acima do teto depois do 5º dia.</p></div></div>' +
    '<div class="rec"><div class="n">5</div><div><h3>Ter o próximo criativo pronto até o dia 25</h3><p>As campanhas que gastam mais de R$ 30 mil duram cerca de ' + A.waste.lifespan.median + ' dias com gasto. Subir um criativo novo por semana evita depender de um só.</p></div></div>' +
    '<div class="rec"><div class="n">6</div><div><h3>Criar alerta de rastreio</h3><p>Duas vezes houve gasto alto com zero compras reportadas (' + outages.map(function (o) { return fd(o.from) + ' a ' + fd(o.to); }).join(' e ') + '). Um alerta para “dia com mais de R$ 5.000 de gasto e nenhuma compra” avisaria no mesmo dia.</p></div></div>' +
    '</div>' +
    '<h3 style="margin-top:8px">Para testar (evidência fraca, mas barata)</h3><div class="recs">' +
    '<div class="rec"><div class="n">A</div><div><h3>Região: separar São Paulo e Rio</h3><p>CPA ' + sg(sp ? sp.vsAvg : null) + ' e ' + sg(rj ? rj.vsAvg : null) + ' contra a média, com ' + pc(((sp ? sp.share : 0) + (rj ? rj.share : 0)) * 100, 0) + ' do gasto. Teste uma campanha sem os dois estados e compare. Antes, confira no CRM se o ticket e a inadimplência de lá compensam.</p></div></div>' +
    '<div class="rec"><div class="n">B</div><div><h3>Excluir 65+</h3><p>É a faixa mais cara (CPA ' + sg(old65 ? old65.vsAvg : null) + ', CPM de R$ 30) e leva ' + pc(old65 ? old65.share * 100 : 0, 0) + ' do gasto.</p></div></div>' +
    '<div class="rec"><div class="n">C</div><div><h3>Mais imagens</h3><p>Formato imagem tem CPA ' + sg(img ? img.vsAvg : null) + ' e CPM de R$ 16 contra R$ 25 do vídeo, mas só ' + pc(img ? img.share * 100 : 0, 0) + ' do gasto. A família IMG é a que mais rende.</p></div></div>' +
    '<div class="rec"><div class="n">D</div><div><h3>Limite de custo (cost cap)</h3><p>Só 4 das 653 campanhas usaram lance com limite. Vale testar nos criativos campeões, com o limite um pouco acima do CPA atual.</p></div></div>' +
    '<div class="rec"><div class="n">E</div><div><h3>Testes dentro de CBO</h3><p>As campanhas ABO (testes) custaram ' + R(abo ? abo.cpa : null) + ' por compra contra ' + R(cbo ? cbo.cpa : null) + ' no CBO e gastaram ' + R(abo ? abo.spend : null) + '. Rodar os testes dentro de CBO tende a custar menos.</p></div></div>' +
    '</div></section>';

  // ---------- limites ----------
  h += '<section><h2>Como ler e limites</h2><ul class="plain">' +
    '<li><b>Compras na Meta não enxergam inadimplência.</b> Um criativo pode ter CPA bom e ainda assim dar prejuízo se muitos pedidos não forem pagos. Na análise com os dados do CRM, os criativos da série C (C34, C38, C43, C45) e V23/V43 tinham de 20% a 36% de pedidos inadimplentes. Confira isso antes de escalar um criativo só pelo CPA.</li>' +
    '<li><b>Valor de compra não foi usado.</b> A Meta registra o valor de compra ×100 desde março (ticket médio de R$ 44 mil). Por isso a análise não mostra ROAS da Meta, só CPA.</li>' +
    '<li><b>Tabelas por anúncio, conjunto e quebras vêm do acumulado de 2026</b> e misturam épocas. As tabelas “no mês”, de orçamento, de idade da campanha e de dia da semana usam os dados diários, sem os dias de falha de rastreio, e já descontam a época.</li>' +
    '<li><b>Os dados mais recentes estão incompletos.</b> As compras chegam com atraso: o CPA dos últimos dias parece pior do que será.</li>' +
    '<li><b>Correlação não prova causa.</b> Campanhas maiores recebem mais gasto justamente quando já estão indo bem, e testes entram em momentos diferentes.</li></ul></section>';

  root.innerHTML = '<div id="acc-inner" style="display:flex;flex-direction:column;gap:36px;min-width:0">' + h + '</div>';
};
