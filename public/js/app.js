// Agenda da Família · interface
(() => {
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const REP = { semanal: 'toda semana', mensal: 'todo mês', anual: 'todo ano' };
  const CACHE_KEY = 'agenda:eventos';

  const hoje0 = new Date();
  const st = {
    eu: null, eventos: [], nomes: { a: 'Marido', b: 'Esposa' },
    mes: new Date(hoje0.getFullYear(), hoje0.getMonth(), 1),
    sel: ymd(hoje0), filtro: 'todos', carregado: false, editId: null, offline: false,
  };
  const nomeDe = (q) => (q === 'a' ? st.nomes.a : q === 'b' ? st.nomes.b : 'Juntos');
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

  // ---------- API ----------
  class ErroApi extends Error { constructor(msg, status) { super(msg); this.status = status; } }
  async function api(metodo, url, corpo) {
    let r;
    try {
      r = await fetch(url, {
        method: metodo, credentials: 'same-origin',
        headers: corpo ? { 'Content-Type': 'application/json' } : {},
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new ErroApi('Sem internet. Tente de novo quando a conexão voltar.', 0);
    }
    const dados = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/api/login' && url !== '/api/eu/senha') { mostrarLogin(); }
    if (!r.ok) throw new ErroApi(dados.erro || 'Algo deu errado. Tente de novo.', r.status);
    return dados;
  }

  // ---------- ocorrências (inclui repetições) ----------
  function ocorreEm(ev, dia) {
    if (!ev.data) return false;
    const base = parse(ev.data);
    if (dia < base) return false;
    switch (ev.repetir) {
      case 'semanal': return Math.round((dia - base) / 864e5) % 7 === 0;
      case 'mensal': return dia.getDate() === base.getDate();
      case 'anual': return dia.getDate() === base.getDate() && dia.getMonth() === base.getMonth();
      default: return ymd(base) === ymd(dia);
    }
  }
  const passaFiltro = (ev) => st.filtro === 'todos' || ev.quem === st.filtro || (st.filtro !== 'ambos' && ev.quem === 'ambos');
  const chaveHora = (e) => (e.diaTodo ? '' : e.inicio || '99');
  const ordena = (x, y) => chaveHora(x).localeCompare(chaveHora(y)) || String(x.titulo).localeCompare(String(y.titulo));
  const doDia = (dia) => st.eventos.filter((e) => passaFiltro(e) && ocorreEm(e, dia)).sort(ordena);

  // ---------- render ----------
  function render() {
    $('#titMes').textContent = maiuscula(fmtMes.format(st.mes));
    document.querySelectorAll('[data-nome="a"]').forEach((el) => { el.textContent = st.nomes.a; });
    document.querySelectorAll('[data-nome="b"]').forEach((el) => { el.textContent = st.nomes.b; });
    document.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === st.filtro));

    const ini = addDias(st.mes, -st.mes.getDay());
    const hj = ymd(new Date());
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = addDias(ini, i), k = ymd(d);
      const evs = doDia(d);
      const cls = ['dia', d.getMonth() !== st.mes.getMonth() && 'fora', k === hj && 'hoje', k === st.sel && 'sel'].filter(Boolean).join(' ');
      const chips = evs.slice(0, 3).map((e) => `<span class="chip ${esc(e.quem)}">${!e.diaTodo && e.inicio ? `<span class="h">${esc(e.inicio)}</span>` : ''}${esc(e.titulo)}</span>`).join('');
      const mais = evs.length > 3 ? `<span class="mais">+${evs.length - 3} mais</span>` : '';
      const pontos = evs.length ? `<span class="pontos">${evs.slice(0, 4).map((e) => `<span class="bola ${esc(e.quem)}"></span>`).join('')}</span>` : '';
      const rot = `${fmtDia.format(d)}${evs.length ? `, ${evs.length} compromisso${evs.length > 1 ? 's' : ''}` : ''}`;
      html += `<button class="${cls}" data-d="${k}" aria-label="${esc(rot)}"><span class="num">${d.getDate()}</span>${chips}${mais}${pontos}</button>`;
    }
    $('#dias').innerHTML = html;

    const sd = parse(st.sel);
    $('#titDia').textContent = st.sel === hj ? 'Hoje' : maiuscula(fmtDia.format(sd).split(',')[0]);
    $('#subDia').textContent = maiuscula(fmtDia.format(sd));
    const evs = doDia(sd);
    $('#listaDia').innerHTML = !st.carregado ? '<div class="vazio">Carregando os compromissos…</div>'
      : evs.length ? evs.map((e) => itemHtml(e)).join('')
      : '<div class="vazio">Nada marcado para este dia.</div>';

    const prox = [];
    for (let i = 0; i < 14; i++) {
      const d = addDias(new Date(), i);
      const l = doDia(d);
      if (l.length) prox.push(`<div class="prox-data">${i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : esc(maiuscula(fmtCurto.format(d)))}</div>${l.map((e) => itemHtml(e)).join('')}`);
    }
    $('#listaProx').innerHTML = !st.carregado ? '<div class="vazio">Carregando…</div>'
      : prox.length ? prox.join('')
      : '<div class="vazio">Nenhum compromisso nas próximas duas semanas.<br><button class="btn-sec" data-acao="novo">Marcar o primeiro</button></div>';
  }

  function itemHtml(e) {
    const hora = e.diaTodo || !e.inicio ? 'Dia todo' : esc(e.inicio);
    const fim = !e.diaTodo && e.fim ? `<small>até ${esc(e.fim)}</small>` : '';
    const meta = [
      `<span class="tag"><span class="bola ${esc(e.quem)}"></span>${esc(nomeDe(e.quem))}</span>`,
      e.local ? `<span>${esc(e.local)}</span>` : '',
      REP[e.repetir] ? `<span>Repete ${REP[e.repetir]}</span>` : '',
    ].join('');
    const notas = e.notas ? `<div class="meta">${esc(e.notas.length > 140 ? `${e.notas.slice(0, 140)}…` : e.notas)}</div>` : '';
    return `<button class="item" data-id="${esc(e.id)}"><div class="hora">${hora}${fim}</div><div><div class="tit">${esc(e.titulo)}</div><div class="meta">${meta}</div>${notas}</div></button>`;
  }

  // ---------- avisos ----------
  let tt;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2800); }
  function aviso(msg) { const a = $('#aviso'); a.textContent = msg || ''; a.hidden = !msg; }

  // ---------- dados ----------
  async function carregar() {
    try {
      const evs = await api('GET', '/api/eventos');
      st.eventos = evs; st.carregado = true; st.offline = false;
      guardar(CACHE_KEY, evs);
      aviso('');
    } catch (e) {
      if (e.status === 401) return;
      const cache = ler(CACHE_KEY);
      if (cache) { st.eventos = cache; st.carregado = true; }
      st.offline = true;
      aviso(cache ? 'Sem internet. Mostrando a última versão salva neste aparelho.' : e.message);
    }
    render();
  }

  // ---------- login ----------
  function mostrarLogin() {
    st.eu = null;
    $('#telaApp').hidden = true;
    $('#telaLogin').hidden = false;
    document.querySelectorAll('.veu').forEach((v) => { v.hidden = true; });
    setTimeout(() => $('#lLogin').focus(), 30);
  }
  function aplicarEu(eu) {
    st.eu = eu; st.nomes = eu.nomes;
    guardar('agenda:eu', eu);
  }
  async function iniciarApp() {
    $('#telaLogin').hidden = true;
    $('#telaApp').hidden = false;
    render();
    await carregar();
    if (st.eu?.senhaPadrao) toast('Troque a senha inicial em Ajustes (ícone de pessoa).');
    avisoInstalar();
  }

  $('#formLogin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#lErro').textContent = '';
    try {
      await api('POST', '/api/login', { login: $('#lLogin').value.trim(), senha: $('#lSenha').value });
      aplicarEu(await api('GET', '/api/eu'));
      $('#lSenha').value = '';
      iniciarApp();
    } catch (e) { $('#lErro').textContent = e.message; }
  });

  // ---------- compromisso ----------
  function abrir(ev, dataPadrao) {
    st.editId = ev ? ev.id : null;
    $('#mTit').textContent = ev ? 'Editar compromisso' : 'Novo compromisso';
    $('#fTitulo').value = ev?.titulo || '';
    $('#fData').value = ev?.data || dataPadrao || st.sel;
    $('#fInicio').value = ev?.inicio || '';
    $('#fFim').value = ev?.fim || '';
    $('#fDiaTodo').checked = !!ev?.diaTodo;
    $('#fLocal').value = ev?.local || '';
    $('#fRepetir').value = ev?.repetir || 'nao';
    $('#fNotas').value = ev?.notas || '';
    $('#fErro').textContent = '';
    const q = ev?.quem || 'ambos';
    document.querySelector(`input[name=quem][value="${q}"]`).checked = true;
    const del = $('#excluir'); del.hidden = !ev; del.classList.remove('conf'); del.textContent = 'Excluir';
    horasAtivas();
    $('#veu').hidden = false;
    if (!ev && window.matchMedia('(min-width:641px)').matches) setTimeout(() => $('#fTitulo').focus(), 30);
  }
  function horasAtivas() { const d = $('#fDiaTodo').checked; $('#fInicio').disabled = d; $('#fFim').disabled = d; }
  $('#fDiaTodo').addEventListener('change', horasAtivas);

  $('#form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const diaTodo = $('#fDiaTodo').checked;
    const dados = {
      titulo: $('#fTitulo').value.trim(), data: $('#fData').value, diaTodo,
      inicio: diaTodo ? '' : $('#fInicio').value, fim: diaTodo ? '' : $('#fFim').value,
      quem: document.querySelector('input[name=quem]:checked').value,
      local: $('#fLocal').value.trim(), repetir: $('#fRepetir').value, notas: $('#fNotas').value.trim(),
    };
    const btn = $('#salvar'); btn.disabled = true; $('#fErro').textContent = '';
    try {
      const editando = st.editId;
      const salvo = editando ? await api('PUT', `/api/eventos/${editando}`, dados) : await api('POST', '/api/eventos', dados);
      st.eventos = st.eventos.filter((e) => e.id !== salvo.id).concat(salvo);
      guardar(CACHE_KEY, st.eventos);
      st.sel = salvo.data;
      const d = parse(salvo.data); st.mes = new Date(d.getFullYear(), d.getMonth(), 1);
      $('#veu').hidden = true; render();
      toast(editando ? 'Compromisso atualizado' : 'Compromisso salvo');
    } catch (e) { $('#fErro').textContent = e.message; }
    finally { btn.disabled = false; }
  });

  $('#excluir').addEventListener('click', async () => {
    const b = $('#excluir');
    if (!b.classList.contains('conf')) {
      b.classList.add('conf');
      const ev = st.eventos.find((x) => x.id === st.editId);
      b.textContent = ev && REP[ev.repetir] ? 'Excluir todas as repetições?' : 'Confirmar exclusão';
      return;
    }
    try {
      await api('DELETE', `/api/eventos/${st.editId}`);
      st.eventos = st.eventos.filter((e) => e.id !== st.editId);
      guardar(CACHE_KEY, st.eventos);
      $('#veu').hidden = true; render(); toast('Compromisso excluído');
    } catch (e) { $('#fErro').textContent = e.message; }
  });

  // ---------- ajustes ----------
  $('#btnAjustes').addEventListener('click', () => {
    $('#nA').value = st.nomes.a; $('#nB').value = st.nomes.b;
    $('#sAtual').value = ''; $('#sNova').value = ''; $('#sErro').textContent = '';
    $('#quemSou').textContent = st.eu ? `Você entrou como ${st.eu.nome} (usuário “${st.eu.login}”).` : '';
    $('#veuAjustes').hidden = false;
  });
  $('#formNomes').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      st.nomes = await api('PUT', '/api/nomes', { a: $('#nA').value.trim(), b: $('#nB').value.trim() });
      if (st.eu) { st.eu.nomes = st.nomes; st.eu.nome = st.nomes[st.eu.pessoa]; guardar('agenda:eu', st.eu); }
      render(); toast('Nomes salvos');
    } catch (e) { toast(e.message); }
  });
  $('#formSenha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#sErro').textContent = '';
    try {
      await api('POST', '/api/eu/senha', { atual: $('#sAtual').value, nova: $('#sNova').value });
      if (st.eu) st.eu.senhaPadrao = false;
      $('#sAtual').value = ''; $('#sNova').value = '';
      toast('Senha trocada');
    } catch (e) { $('#sErro').textContent = e.message; }
  });
  $('#sair').addEventListener('click', async () => {
    try { await api('POST', '/api/logout'); } catch {}
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('agenda:eu'); } catch {}
    st.eventos = []; st.carregado = false;
    mostrarLogin();
  });

  // ---------- navegação ----------
  $('#ant').addEventListener('click', () => { st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() - 1, 1); render(); });
  $('#prox').addEventListener('click', () => { st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() + 1, 1); render(); });
  $('#hoje').addEventListener('click', () => { const h = new Date(); st.mes = new Date(h.getFullYear(), h.getMonth(), 1); st.sel = ymd(h); render(); });
  $('#novo').addEventListener('click', () => abrir(null, st.sel));
  $('#addDia').addEventListener('click', () => abrir(null, st.sel));
  document.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => { b.closest('.veu').hidden = true; }));
  document.querySelectorAll('.veu').forEach((v) => v.addEventListener('click', (e) => { if (e.target === v) v.hidden = true; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.veu').forEach((v) => { v.hidden = true; }); });
  document.querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.f; render(); }));
  $('#dias').addEventListener('click', (e) => {
    const c = e.target.closest('.dia'); if (!c) return;
    st.sel = c.dataset.d;
    const d = parse(st.sel);
    if (d.getMonth() !== st.mes.getMonth()) st.mes = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    if (window.matchMedia('(max-width:980px)').matches) $('#titDia').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#dias').addEventListener('dblclick', (e) => { const c = e.target.closest('.dia'); if (c) abrir(null, c.dataset.d); });
  document.querySelector('.lado').addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="novo"]')) { abrir(null, st.sel); return; }
    const it = e.target.closest('.item'); if (!it) return;
    const ev = st.eventos.find((x) => String(x.id) === it.dataset.id); if (ev) abrir(ev);
  });

  // Mantém os dois aparelhos em dia: recarrega ao voltar para o app e a cada minuto.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.eu) carregar(); });
  setInterval(() => { if (!document.hidden && st.eu) carregar(); }, 60e3);

  // ---------- instalar na tela inicial ----------
  let pedidoInstalar = null;
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; avisoInstalar(); });
  window.addEventListener('appinstalled', () => { $('#avisoInstalar').hidden = true; toast('Agenda instalada na tela inicial'); });
  function avisoInstalar() {
    if (!st.eu || instalado() || ler('agenda:semInstalar')) return;
    if (pedidoInstalar) {
      $('#txtInstalar').innerHTML = '<b>Coloque a agenda na tela do celular</b> para abrir como aplicativo.';
      $('#btnInstalar').hidden = false;
    } else if (iOS) {
      $('#txtInstalar').innerHTML = '<b>Coloque a agenda na tela do iPhone:</b> toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
      $('#btnInstalar').hidden = true;
    } else return;
    $('#avisoInstalar').hidden = false;
  }
  $('#btnInstalar').addEventListener('click', async () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice.catch(() => {});
    pedidoInstalar = null; $('#avisoInstalar').hidden = true;
  });
  $('#fecharInstalar').addEventListener('click', () => { guardar('agenda:semInstalar', true); $('#avisoInstalar').hidden = true; });

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  // ---------- início ----------
  (async () => {
    try {
      aplicarEu(await api('GET', '/api/eu'));
      iniciarApp();
    } catch (e) {
      if (e.status === 401) return; // já mostrou o login
      // Sem internet: abre com o que está salvo neste aparelho.
      const eu = ler('agenda:eu');
      if (eu) { st.eu = eu; st.nomes = eu.nomes; iniciarApp(); } else { mostrarLogin(); $('#lErro').textContent = e.message; }
    }
  })();
})();
