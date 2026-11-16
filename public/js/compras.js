// Agenda da Família · lista de compras compartilhada
(() => {
  const $ = (s) => document.querySelector(s);
  const { api, toast, esc, guardar, ler, estado, nomeDe } = window.AG;
  const CACHE_KEY = 'agenda:compras';
  const CATEGORIAS_PADRAO = ['Hortifrúti', 'Açougue e peixaria', 'Padaria', 'Frios e laticínios', 'Mercearia', 'Bebidas',
    'Congelados', 'Limpeza', 'Higiene', 'Farmácia', 'Pet', 'Outros'];
  const UNIDADES_PADRAO = ['un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'dz', 'lata', 'garrafa'];

  const cs = { itens: [], sugestoes: [], categorias: CATEGORIAS_PADRAO, unidades: UNIDADES_PADRAO, carregado: false, editId: null };
  const fmtQ = (q) => Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const lerQ = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const quemPessoa = (id) => {
    const eu = estado.eu;
    if (!eu || !id) return '';
    if (id === eu.id) return 'você';
    return nomeDe(eu.pessoa === 'a' ? 'b' : 'a');
  };

  // ---------- selects ----------
  function preencherSelects() {
    for (const id of ['#iUni', '#eUni']) {
      const sel = $(id), v = sel.value;
      sel.innerHTML = cs.unidades.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
      if (v) sel.value = v;
    }
    for (const id of ['#iCat', '#eCat']) {
      const sel = $(id), v = sel.value;
      sel.innerHTML = cs.categorias.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      sel.value = v || 'Outros';
    }
    $('#sugestoes').innerHTML = cs.sugestoes.map((s) => `<option value="${esc(s.nome)}"></option>`).join('');
  }

  // ---------- render ----------
  function linhaItem(i) {
    const quem = i.comprado ? quemPessoa(i.compradoPor) : quemPessoa(i.criadoPor);
    const info = [i.obs ? esc(i.obs) : '', quem ? (i.comprado ? `pego por ${esc(quem)}` : `pedido por ${esc(quem)}`) : ''].filter(Boolean).join(' · ');
    return `<div class="linha-compra${i.comprado ? ' feito' : ''}">
      <button class="marcar" data-marcar="${i.id}" aria-pressed="${i.comprado}" aria-label="${i.comprado ? 'Tirar do carrinho' : 'Colocar no carrinho'}: ${esc(i.nome)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </button>
      <button class="corpo-compra" data-editar="${i.id}">
        <span class="nome-compra">${esc(i.nome)}</span>
        <span class="qtd-chip">${esc(fmtQ(i.quantidade))} ${esc(i.unidade)}</span>
        ${info ? `<small>${info}</small>` : ''}
      </button>
    </div>`;
  }

  function render() {
    const pendentes = cs.itens.filter((i) => !i.comprado);
    const feitos = cs.itens.filter((i) => i.comprado);
    const cont = $('#contCompras');
    cont.textContent = pendentes.length; cont.hidden = !pendentes.length;

    $('#resumoCompras').innerHTML = !cs.carregado ? ''
      : `<b>${pendentes.length}</b> ${pendentes.length === 1 ? 'item para comprar' : 'itens para comprar'}${feitos.length ? ` · <b>${feitos.length}</b> no carrinho` : ''}`;

    if (!cs.carregado) { $('#listaCompras').innerHTML = '<div class="vazio">Carregando a lista…</div>'; $('#carrinho').innerHTML = ''; return; }

    const ordem = (c) => { const i = cs.categorias.indexOf(c); return i < 0 ? 99 : i; };
    const grupos = new Map();
    for (const i of pendentes.slice().sort((x, y) => ordem(x.categoria) - ordem(y.categoria) || x.nome.localeCompare(y.nome, 'pt-BR'))) {
      if (!grupos.has(i.categoria)) grupos.set(i.categoria, []);
      grupos.get(i.categoria).push(i);
    }
    $('#listaCompras').innerHTML = pendentes.length
      ? [...grupos].map(([cat, itens]) => `<section class="grupo-compra"><h3>${esc(cat)} <span>${itens.length}</span></h3>${itens.map(linhaItem).join('')}</section>`).join('')
      : `<div class="vazio">${feitos.length ? 'Tudo no carrinho. Boas compras!' : 'A lista está vazia. Adicione o primeiro item.'}</div>`;

    $('#carrinho').innerHTML = feitos.length ? `<section class="grupo-compra carrinho">
      <h3>No carrinho <span>${feitos.length}</span><button class="btn-sec btn-limpar" id="limpar">Limpar comprados</button></h3>
      ${feitos.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).map(linhaItem).join('')}
    </section>` : '';
  }

  function aviso(msg) { const a = $('#avisoCompras'); a.textContent = msg || ''; a.hidden = !msg; }

  // ---------- dados ----------
  let carregando = false;
  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      const d = await api('GET', '/api/compras');
      Object.assign(cs, { itens: d.itens, sugestoes: d.sugestoes, categorias: d.categorias, unidades: d.unidades, carregado: true });
      guardar(CACHE_KEY, d);
      aviso('');
    } catch (e) {
      if (e.status === 401) return;
      const c = ler(CACHE_KEY);
      if (c) Object.assign(cs, { itens: c.itens, sugestoes: c.sugestoes, categorias: c.categorias, unidades: c.unidades, carregado: true });
      aviso(c ? 'Sem internet. Mostrando a última versão da lista salva neste aparelho.' : e.message);
    } finally {
      carregando = false;
    }
    preencherSelects();
    render();
  }

  const salvarCache = () => {
    const c = ler(CACHE_KEY) || {};
    guardar(CACHE_KEY, { ...c, itens: cs.itens, sugestoes: cs.sugestoes, categorias: cs.categorias, unidades: cs.unidades });
  };
  const trocarItem = (item) => { cs.itens = cs.itens.filter((i) => i.id !== item.id).concat(item); salvarCache(); };

  // ---------- quantidade (− / +) ----------
  document.querySelectorAll('.qtd').forEach((q) => q.addEventListener('click', (e) => {
    const b = e.target.closest('[data-passo]'); if (!b) return;
    const inp = q.querySelector('input');
    const atual = lerQ(inp.value);
    let novo;
    if (!Number.isFinite(atual) || atual <= 0) novo = 1;
    else if (b.dataset.passo === '1') novo = atual < 1 ? 1 : atual + 1;
    else novo = atual > 1 ? Math.max(1, atual - 1) : 0.5; // abaixo de 1: meio (ex.: 0,5 kg)
    inp.value = fmtQ(Math.round(novo * 1000) / 1000);
  }));

  // Escolher uma sugestão já preenche a unidade e a seção usadas da última vez.
  function autoPreencher(nomeSel, uniSel, catSel) {
    const s = cs.sugestoes.find((x) => x.nome.toLowerCase() === $(nomeSel).value.trim().toLowerCase());
    if (s) { $(uniSel).value = s.unidade; $(catSel).value = s.categoria; }
  }
  $('#iNome').addEventListener('change', () => autoPreencher('#iNome', '#iUni', '#iCat'));
  $('#iNome').addEventListener('input', (e) => { if (e.inputType === 'insertReplacementText' || !e.inputType) autoPreencher('#iNome', '#iUni', '#iCat'); });

  // ---------- adicionar ----------
  $('#formItem').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#iErro').textContent = '';
    const corpo = { nome: $('#iNome').value.trim(), quantidade: $('#iQtd').value, unidade: $('#iUni').value, categoria: $('#iCat').value };
    try {
      const item = await api('POST', '/api/compras', corpo);
      trocarItem(item);
      if (!cs.sugestoes.some((s) => s.nome.toLowerCase() === item.nome.toLowerCase())) cs.sugestoes.push({ nome: item.nome, unidade: item.unidade, categoria: item.categoria });
      preencherSelects(); render();
      toast(item.somado ? `${item.nome} já estava na lista: agora são ${fmtQ(item.quantidade)} ${item.unidade}` : `${item.nome} entrou na lista`);
      $('#iNome').value = ''; $('#iQtd').value = '1'; $('#iUni').value = 'un';
      $('#iNome').focus();
    } catch (e) { $('#iErro').textContent = e.message; }
  });

  // ---------- marcar / editar / limpar ----------
  $('#vistaCompras').addEventListener('click', async (e) => {
    const m = e.target.closest('[data-marcar]');
    if (m) {
      const item = cs.itens.find((i) => i.id === Number(m.dataset.marcar)); if (!item) return;
      const antes = item.comprado;
      item.comprado = !antes; item.compradoPor = item.comprado ? estado.eu?.id : null;
      render();
      try { trocarItem(await api('POST', `/api/compras/${item.id}/comprado`, { comprado: item.comprado })); render(); }
      catch (err) { item.comprado = antes; render(); toast(err.message); }
      return;
    }
    const ed = e.target.closest('[data-editar]');
    if (ed) { abrirEdicao(Number(ed.dataset.editar)); return; }
    const lim = e.target.closest('#limpar');
    if (lim) {
      if (!lim.classList.contains('conf')) { lim.classList.add('conf'); lim.textContent = 'Confirmar: tirar da lista'; return; }
      try {
        const r = await api('POST', '/api/compras/limpar');
        cs.itens = cs.itens.filter((i) => !i.comprado); salvarCache(); render();
        toast(`${r.removidos} ${r.removidos === 1 ? 'item saiu' : 'itens saíram'} da lista`);
      } catch (err) { toast(err.message); }
    }
  });

  function abrirEdicao(id) {
    const i = cs.itens.find((x) => x.id === id); if (!i) return;
    cs.editId = id;
    $('#eNome').value = i.nome; $('#eQtd').value = fmtQ(i.quantidade);
    $('#eUni').value = i.unidade; $('#eCat').value = i.categoria; $('#eObs').value = i.obs || '';
    const quem = quemPessoa(i.criadoPor);
    $('#eQuem').textContent = quem ? `Pedido por ${quem}.` : '';
    $('#eErro').textContent = '';
    const del = $('#eExcluir'); del.classList.remove('conf'); del.textContent = 'Tirar da lista';
    $('#veuItem').hidden = false;
  }
  $('#formEditItem').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#eErro').textContent = '';
    try {
      const item = await api('PUT', `/api/compras/${cs.editId}`, {
        nome: $('#eNome').value.trim(), quantidade: $('#eQtd').value, unidade: $('#eUni').value, categoria: $('#eCat').value, obs: $('#eObs').value.trim(),
      });
      trocarItem(item); render();
      $('#veuItem').hidden = true; toast('Item atualizado');
    } catch (e) { $('#eErro').textContent = e.message; }
  });
  $('#eExcluir').addEventListener('click', async () => {
    const b = $('#eExcluir');
    if (!b.classList.contains('conf')) { b.classList.add('conf'); b.textContent = 'Confirmar'; return; }
    try {
      await api('DELETE', `/api/compras/${cs.editId}`);
      cs.itens = cs.itens.filter((i) => i.id !== cs.editId); salvarCache(); render();
      $('#veuItem').hidden = true; toast('Item tirado da lista');
    } catch (e) { $('#eErro').textContent = e.message; }
  });

  preencherSelects();
  render();
  window.AG.compras = {
    carregar,
    limpar() { Object.assign(cs, { itens: [], sugestoes: [], carregado: false }); render(); },
  };
})();
