/* Tech Woman — jornada de perfil
 * Porta em JavaScript puro do componente gerado pelo Claude Design.
 * Estado único em `state`; `setState` mescla e redesenha. Estilos ficam em css/jornada.css:
 * aqui só alternamos classes, atributos (aria-pressed, disabled, hidden) e larguras de barras.
 *
 * Para ver uma tela direto (útil em desenvolvimento): jornada.html?tela=resultado|cadastro|confirmado
 */
(function () {
  'use strict';

  // ---------- Dados ----------

  var AREAS = {
    backend: 'Backend',
    frontend: 'Frontend',
    dados: 'Dados',
    ux: 'UX & Design',
    produto: 'Produto',
    cloud: 'Cloud & Infraestrutura'
  };

  var PERFIS = {
    analitica: { nome: 'Analista', desc: 'Curiosa, enxerga padrões e gosta de números.' },
    construtora: { nome: 'Construtora', desc: 'Mão na massa: gosta de fazer as coisas funcionarem.' },
    criativa: { nome: 'Criativa', desc: 'Visual e empática, pensa sempre nas pessoas.' },
    estrategista: { nome: 'Estrategista', desc: 'Organizada, com visão de negócio e prioridades claras.' },
    guardia: { nome: 'Guardiã', desc: 'Detalhista, garante que nada saia do ar.' }
  };

  var TRACOS = {
    analitica: { grupo: 'analitica', frase: 'perfil analítico', chip: 'Analítica' },
    numeros: { grupo: 'analitica', frase: 'interesse por números', chip: 'Números' },
    logica: { grupo: 'construtora', frase: 'raciocínio lógico', chip: 'Lógica' },
    construtora: { grupo: 'construtora', frase: 'gosto por colocar a mão na massa', chip: 'Mão na massa' },
    criativa: { grupo: 'criativa', frase: 'criatividade', chip: 'Criativa' },
    empatia: { grupo: 'criativa', frase: 'empatia', chip: 'Empática' },
    estrategista: { grupo: 'estrategista', frase: 'visão estratégica', chip: 'Estratégica' },
    guardia: { grupo: 'guardia', frase: 'atenção a detalhes', chip: 'Detalhista' }
  };

  var SLOTS = {
    manha: { label: 'Manhã (09h às 12h)', ini: 9, fim: 12 },
    tarde: { label: 'Tarde (12h às 18h)', ini: 12, fim: 18 },
    noite: { label: 'Noite (18h às 21h)', ini: 18, fim: 21 }
  };

  var DIAS = [
    { semana: 'Seg', data: '16/11', longo: 'segunda-feira, 16 de novembro de 2026' },
    { semana: 'Ter', data: '17/11', longo: 'terça-feira, 17 de novembro de 2026' },
    { semana: 'Qua', data: '18/11', longo: 'quarta-feira, 18 de novembro de 2026' },
    { semana: 'Qui', data: '19/11', longo: 'quinta-feira, 19 de novembro de 2026' },
    { semana: 'Sex', data: '20/11', longo: 'sexta-feira, 20 de novembro de 2026' }
  ];

  var PERGUNTAS = [
    { tipo: 'pergunta', texto: 'Num projeto em grupo, qual papel você assume naturalmente?', opcoes: [
      { label: 'Analiso as informações e encontro padrões', s: { dados: 3 }, t: ['analitica'] },
      { label: 'Construo a lógica que faz tudo funcionar por trás', s: { backend: 3 }, t: ['construtora'] },
      { label: 'Cuido do visual e da experiência de quem vai usar', s: { frontend: 2, ux: 1 }, t: ['criativa'] },
      { label: 'Organizo o time e defino as prioridades', s: { produto: 3 }, t: ['estrategista'] }
    ]},
    { tipo: 'desafio', texto: 'Desafio relâmpago: qual é o próximo número da sequência 2, 6, 12, 20, ?', correta: 1,
      explica: 'As diferenças crescem de 2 em 2 (4, 6, 8…), então o próximo salto é 10: 20 + 10 = 30.', opcoes: [
      { label: '28', s: {}, t: [] },
      { label: '30', s: { dados: 2, backend: 1 }, t: ['numeros', 'logica'] },
      { label: '32', s: {}, t: [] },
      { label: '24', s: {}, t: [] }
    ]},
    { tipo: 'pergunta', texto: 'O que mais faz seus olhos brilharem?', opcoes: [
      { label: 'Descobrir respostas escondidas nos números', s: { dados: 3 }, t: ['numeros'] },
      { label: 'Uma tela bonita e fluida funcionando no celular', s: { frontend: 3 }, t: ['criativa'] },
      { label: 'Uma API rápida que aguenta milhões de acessos', s: { backend: 3 }, t: ['construtora'] },
      { label: 'Ver uma ideia virar produto no mercado', s: { produto: 3 }, t: ['estrategista'] }
    ]},
    { tipo: 'desafio', texto: 'Desafio: as clientes de um app dizem que é difícil achar o botão de pagar. O que você faz primeiro?', opcoes: [
      { label: 'Levanto os dados de uso para ver onde as pessoas desistem', s: { dados: 2, produto: 1 }, t: ['analitica'] },
      { label: 'Converso com usuárias e redesenho a tela', s: { ux: 3 }, t: ['empatia', 'criativa'] },
      { label: 'Ajusto a tela no código e publico uma nova versão', s: { frontend: 3 }, t: ['construtora'] },
      { label: 'Meço o impacto no faturamento e priorizo com o time', s: { produto: 3 }, t: ['estrategista'] }
    ]},
    { tipo: 'pergunta', texto: 'Qual ferramenta você levaria para uma ilha deserta?', opcoes: [
      { label: 'Uma planilha poderosa', s: { dados: 2 }, t: ['numeros'] },
      { label: 'Um caderno de esboços', s: { ux: 3 }, t: ['criativa'] },
      { label: 'Um notebook com terminal', s: { backend: 2 }, t: ['logica'] },
      { label: 'Um servidor que nunca cai', s: { cloud: 3 }, t: ['guardia'] }
    ]},
    { tipo: 'desafio', texto: 'Desafio: o site do evento vai receber 10 vezes mais acessos no dia da abertura. Qual é a sua jogada?', opcoes: [
      { label: 'Escalo a infraestrutura na nuvem antes do pico', s: { cloud: 3 }, t: ['guardia'] },
      { label: 'Monto um painel para acompanhar os acessos em tempo real', s: { dados: 2 }, t: ['analitica'] },
      { label: 'Otimizo as consultas e o cache da API', s: { backend: 3 }, t: ['construtora'] },
      { label: 'Aviso o público sobre os horários de menor movimento', s: { produto: 2 }, t: ['estrategista'] }
    ]},
    { tipo: 'desafio', texto: 'Desafio: o que você corrigiria primeiro no site de inscrições?', opcoes: [
      { label: 'O botão de inscrição some quando abro no celular', s: { frontend: 3 }, t: ['criativa'] },
      { label: 'O formulário grava inscrições duplicadas no banco', s: { backend: 3 }, t: ['logica'] },
      { label: 'Ninguém sabe quantas pessoas se inscrevem por dia', s: { dados: 2 }, t: ['analitica'] },
      { label: 'O site fica fora do ar durante a madrugada', s: { cloud: 3 }, t: ['guardia'] }
    ]},
    { tipo: 'mentoria', texto: 'Para fechar: em qual horário você prefere fazer a mentoria?', opcoes: [
      { label: 'Manhã (09h às 12h)', h: 'manha', s: {}, t: [] },
      { label: 'Tarde (12h às 18h)', h: 'tarde', s: {}, t: [] },
      { label: 'Noite (18h às 21h)', h: 'noite', s: {}, t: [] }
    ]}
  ];

  // Base simulada (mock) com a mesma estrutura da planilha de mentoras.
  var MENTORAS = [
    { id: 'm01', nome: 'Rafaela', skill: 'Backend · Tech Lead · Arquitetura', areas: ['backend', 'cloud'], ini: 9, fim: 18, linkedin: 'linkedin.com/in/rafaela', ativas: 4 },
    { id: 'm02', nome: 'Juliana', skill: 'Backend · Java · APIs', areas: ['backend'], ini: 9, fim: 18, linkedin: 'linkedin.com/in/juliana', ativas: 1 },
    { id: 'm03', nome: 'Camila', skill: 'Backend · Node.js · Microsserviços', areas: ['backend'], ini: 18, fim: 21, linkedin: 'linkedin.com/in/camila', ativas: 2 },
    { id: 'm04', nome: 'Patrícia', skill: 'Engenharia de Dados · SQL', areas: ['dados', 'backend'], ini: 9, fim: 12, linkedin: 'linkedin.com/in/patricia', ativas: 3 },
    { id: 'm05', nome: 'Fernanda', skill: 'Ciência de Dados · Python · BI', areas: ['dados'], ini: 18, fim: 21, linkedin: 'linkedin.com/in/fernanda', ativas: 0 },
    { id: 'm06', nome: 'Larissa', skill: 'Frontend · React · Acessibilidade', areas: ['frontend', 'ux'], ini: 12, fim: 18, linkedin: 'linkedin.com/in/larissa', ativas: 2 },
    { id: 'm07', nome: 'Beatriz', skill: 'Frontend · Mobile · Design System', areas: ['frontend'], ini: 18, fim: 21, linkedin: 'linkedin.com/in/beatriz', ativas: 1 },
    { id: 'm08', nome: 'Mariana', skill: 'UX Research · UI Design', areas: ['ux', 'frontend'], ini: 9, fim: 18, linkedin: 'linkedin.com/in/mariana', ativas: 3 },
    { id: 'm09', nome: 'Aline', skill: 'Product Manager · Agilidade', areas: ['produto'], ini: 18, fim: 21, linkedin: 'linkedin.com/in/aline', ativas: 2 },
    { id: 'm10', nome: 'Renata', skill: 'Produto · Negócios · Liderança', areas: ['produto', 'ux'], ini: 9, fim: 12, linkedin: 'linkedin.com/in/renata', ativas: 0 },
    { id: 'm11', nome: 'Daniela', skill: 'Cloud · DevOps · Kubernetes', areas: ['cloud', 'backend'], ini: 12, fim: 18, linkedin: 'linkedin.com/in/daniela', ativas: 1 },
    { id: 'm12', nome: 'Tatiane', skill: 'SRE · Segurança · Infraestrutura', areas: ['cloud'], ini: 9, fim: 18, linkedin: 'linkedin.com/in/tatiane', ativas: 2 }
  ];

  var DEMO_RESPOSTAS = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 0 };

  var TIPO_LABEL = { pergunta: 'Pergunta', desafio: 'Desafio', mentoria: 'Mentoria' };

  var ICONE_RELOGIO = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A1F96" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICONE_LINKEDIN = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A1F96" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 11v5M8 8v.01M12 16v-5M16 16v-3a2 2 0 0 0-4 0"/></svg>';

  // ---------- Utilitários ----------

  function hh(n) { return (n < 10 ? '0' : '') + n + ':00'; }

  function mentoraPorId(id) {
    for (var k = 0; k < MENTORAS.length; k++) { if (MENTORAS[k].id === id) return MENTORAS[k]; }
    return MENTORAS[0];
  }

  // Simula horários já ocupados (no sistema real vem da coleção de agendamentos)
  function ocupadoBase(id, d, h) {
    var n = 0;
    for (var k = 0; k < id.length; k++) n += id.charCodeAt(k);
    return (n + d * 7 + h * 3) % 5 === 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Estado ----------

  function estadoInicial(tela) {
    var s = { step: 'intro', i: 0, answers: {}, pedidos: {}, extra: {}, reservas: {}, mentoraSel: null, dia: 0, slot: null,
      fNome: '', fEmail: '', fWhats: '', fLinkedin: '', conf: null };
    if (tela === 'resultado' || tela === 'cadastro' || tela === 'confirmado') {
      s.answers = Object.assign({}, DEMO_RESPOSTAS);
      s.i = PERGUNTAS.length - 1;
      s.step = 'result';
    }
    if (tela === 'cadastro') { s.step = 'cadastro'; s.mentoraSel = 'm02'; }
    if (tela === 'confirmado') {
      s.step = 'confirmado';
      s.mentoraSel = 'm02';
      s.pedidos = { m02: true };
      s.extra = { m02: 1 };
      s.conf = { mentoraId: 'm02', dia: 0, slot: 10, nome: 'Nome da participante', email: 'email@exemplo.com', whats: '(11) 90000-0000', linkedin: 'linkedin.com/in/participante' };
    }
    return s;
  }

  var state = estadoInicial(new URLSearchParams(location.search).get('tela') || 'fluxo');

  function setState(patch) {
    var mudouTela = ('step' in patch && patch.step !== state.step) || ('i' in patch && patch.i !== state.i);
    state = Object.assign({}, state, patch);
    render();
    if (mudouTela) window.scrollTo(0, 0);
  }

  function ocupado(id, d, h) {
    return ocupadoBase(id, d, h) || !!state.reservas[id + '-' + d + '-' + h];
  }

  // ---------- Regras: pontuação, perfil e recomendação ----------

  function calcXp(answers) {
    var xp = 0;
    PERGUNTAS.forEach(function (q, idx) {
      var a = answers[idx];
      if (a == null) return;
      xp += 10;
      if (q.correta != null && a === q.correta) xp += 20;
    });
    return xp;
  }

  function resultado(answers) {
    var score = {}, maxPos = {};
    Object.keys(AREAS).forEach(function (k) { score[k] = 0; maxPos[k] = 0; });
    var count = {}, ordem = [], grupos = {};
    var horario = 'noite';
    PERGUNTAS.forEach(function (q, idx) {
      Object.keys(AREAS).forEach(function (k) {
        var best = 0;
        q.opcoes.forEach(function (o) { if ((o.s[k] || 0) > best) best = o.s[k]; });
        maxPos[k] += best;
      });
      var a = answers[idx];
      if (a == null) return;
      var o = q.opcoes[a];
      Object.keys(o.s).forEach(function (k) { score[k] += o.s[k]; });
      o.t.forEach(function (t) {
        if (!(t in count)) { count[t] = 0; ordem.push(t); }
        count[t] += 1;
        var g = TRACOS[t].grupo;
        grupos[g] = (grupos[g] || 0) + 1;
      });
      if (o.h) horario = o.h;
    });
    var ranking = Object.keys(AREAS).sort(function (x, y) {
      return (score[y] / maxPos[y]) - (score[x] / maxPos[x]) || score[y] - score[x];
    });
    var nivelDe = function (k) {
      return Math.max(1, Math.min(5, Math.round((score[k] / (maxPos[k] || 1)) * 5)));
    };
    var tracos = ordem.slice().sort(function (x, y) { return count[y] - count[x]; }).slice(0, 3);
    ['analitica', 'criativa', 'construtora'].forEach(function (t) {
      if (tracos.length < 3 && tracos.indexOf(t) < 0) tracos.push(t);
    });
    var perfil = Object.keys(grupos).sort(function (x, y) { return grupos[y] - grupos[x]; })[0] || 'construtora';
    return { score: score, maxPos: maxPos, ranking: ranking, nivelDe: nivelDe, tracos: tracos, perfil: perfil, horario: horario };
  }

  // Recomendação: mesmo perfil > horário compatível > menos mentorias ativas (balanceamento)
  function recomendar(top, second, periodo) {
    return MENTORAS.map(function (m, idx) {
      var ativas = m.ativas + (state.extra[m.id] || 0);
      var perfil = m.areas[0] === top ? 2 : (m.areas.indexOf(top) >= 0 ? 1 : 0);
      var proximo = m.areas.indexOf(second) >= 0 ? 1 : 0;
      var hor = (m.ini < periodo.fim && m.fim > periodo.ini) ? 1 : 0;
      return { m: m, ativas: ativas, perfil: perfil, proximo: proximo, hor: hor, idx: idx };
    }).sort(function (a, b) {
      return (b.perfil > 0) - (a.perfil > 0) || b.hor - a.hor || a.ativas - b.ativas || b.perfil - a.perfil || b.proximo - a.proximo || a.idx - b.idx;
    }).slice(0, 3);
  }

  function dadosOk() {
    return !!(state.fNome.trim() && state.fEmail.indexOf('@') > 0 && state.fWhats.trim() && state.fLinkedin.trim());
  }

  // ---------- Renderização ----------

  var raiz = document.getElementById('jornada');

  function campo(nome, valor) {
    document.querySelectorAll('[data-campo="' + nome + '"]').forEach(function (el) { el.textContent = valor; });
  }
  function lista(nome, html) {
    raiz.querySelector('[data-lista="' + nome + '"]').innerHTML = html;
  }

  function render() {
    var st = state;
    var total = PERGUNTAS.length;

    raiz.querySelectorAll('[data-tela]').forEach(function (el) {
      el.hidden = el.getAttribute('data-tela') !== st.step;
    });
    campo('xp', calcXp(st.answers));
    campo('total', total);

    if (st.step === 'quiz') renderQuiz(total);
    if (st.step === 'result') renderResultado();
    if (st.step === 'cadastro') renderCadastro();
    if (st.step === 'confirmado') renderConfirmado();
  }

  function renderQuiz(total) {
    var i = state.i;
    var q = PERGUNTAS[i];
    var sel = state.answers[i];
    var hasSel = sel != null;
    var progresso = Math.round(((i + (hasSel ? 1 : 0)) / total) * 100);

    campo('num', i + 1);
    campo('pergunta', q.texto);
    var tipo = raiz.querySelector('[data-campo="tipo"]');
    tipo.textContent = TIPO_LABEL[q.tipo];
    tipo.className = 'etiqueta-tipo etiqueta-tipo--' + q.tipo;

    raiz.querySelector('.barra-progresso').setAttribute('aria-valuenow', progresso);
    raiz.querySelector('.barra-progresso__preenchimento').style.width = progresso + '%';

    lista('opcoes', q.opcoes.map(function (o, k) {
      return '<button type="button" class="opcao" data-opcao="' + k + '" aria-pressed="' + (sel === k) + '">' +
        '<span class="opcao__letra">' + 'ABCD'.charAt(k) + '</span>' +
        '<span>' + esc(o.label) + '</span>' +
      '</button>';
    }).join(''));

    var feedback = raiz.querySelector('[data-campo="feedback"]');
    var acertou = hasSel && sel === q.correta;
    feedback.hidden = !(hasSel && q.correta != null);
    feedback.classList.toggle('feedback--acerto', acertou);
    campo('feedback-titulo', acertou ? 'Mandou bem! +20 XP de bônus' : 'Quase! A resposta certa é 30.');
    campo('feedback-texto', q.explica || '');

    var proxima = raiz.querySelector('[data-acao="proxima"]');
    proxima.disabled = !hasSel;
    proxima.textContent = i === total - 1 ? 'Ver meu resultado' : 'Próxima';
  }

  function renderResultado() {
    var r = resultado(state.answers);
    var top = r.ranking[0];
    var second = r.ranking[1];
    var nivel = r.nivelDe(top);
    var periodo = SLOTS[r.horario];
    var perfilInfo = PERFIS[r.perfil];
    var f = r.tracos.map(function (t) { return TRACOS[t].frase; });

    campo('top-nome', AREAS[top]);
    campo('second-nome', AREAS[second]);
    campo('nivel', nivel);
    campo('perfil-nome', perfilInfo.nome);
    campo('perfil-desc', perfilInfo.desc);
    campo('horario-label', periodo.label);
    campo('resumo', 'Você tem aptidão nível ' + nivel + ' para ' + AREAS[top] + ', com perfil ' + perfilInfo.nome +
      ': demonstra ' + f[0] + ', ' + f[1] + ' e ' + f[2] + '.');

    raiz.querySelector('[data-lista="nivel-pontos"]').setAttribute('aria-label', 'Nível ' + nivel + ' de 5');
    lista('nivel-pontos', [1, 2, 3, 4, 5].map(function (n) {
      return '<span class="nivel__ponto' + (n <= nivel ? ' nivel__ponto--ativo' : '') + '"></span>';
    }).join(''));

    lista('tracos', r.tracos.map(function (t) {
      return '<span class="chip chip--traco">' + esc(TRACOS[t].chip) + '</span>';
    }).join(''));

    lista('barras', r.ranking.map(function (k, idx) {
      var pct = Math.max(6, Math.round((r.score[k] / (r.maxPos[k] || 1)) * 100));
      return '<div class="afinidade">' +
        '<div class="afinidade__topo">' +
          '<span class="afinidade__nome">' + esc(AREAS[k]) + '</span>' +
          '<span class="afinidade__nivel">nível ' + r.nivelDe(k) + '</span>' +
        '</div>' +
        '<div class="afinidade__trilho"><div class="afinidade__barra afinidade__barra--' + (idx + 1) + '" data-largura="' + pct + '"></div></div>' +
      '</div>';
    }).join(''));
    raiz.querySelectorAll('[data-largura]').forEach(function (el) {
      el.style.width = el.getAttribute('data-largura') + '%';
    });

    lista('recomendadas', recomendar(top, second, periodo).map(function (x, pos) {
      var m = x.m;
      var pedido = !!state.pedidos[m.id];
      var tags = [];
      if (x.perfil > 0) tags.push('Mesmo perfil');
      else if (x.proximo) tags.push('Perfil próximo');
      tags.push(x.hor ? 'Horário compatível' : 'Outro horário');
      tags.push(x.ativas === 1 ? '1 mentoria ativa' : x.ativas + ' mentorias ativas');

      return '<div class="recomendada' + (pos === 0 ? ' recomendada--destaque' : '') + '">' +
        (pos === 0 ? '<span class="recomendada__selo">Mais indicada para você</span>' : '') +
        '<div class="mentora-id">' +
          '<span class="avatar avatar--' + (pos + 1) + '" aria-hidden="true">' + esc(m.nome.charAt(0)) + '</span>' +
          '<div class="mentora-id__texto">' +
            '<span class="mentora-id__nome">' + esc(m.nome) + '</span>' +
            '<span class="mentora-id__skill">' + esc(m.skill) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="recomendada__info">' +
          '<span class="com-icone">' + ICONE_RELOGIO + 'Mentoria das ' + hh(m.ini) + ' às ' + hh(m.fim) + '</span>' +
          '<a class="com-icone" href="#linkedin">' + ICONE_LINKEDIN + esc(m.linkedin) + '</a>' +
        '</div>' +
        '<div class="lista-chips recomendada__tags">' +
          tags.map(function (t) { return '<span class="chip chip--tag">' + esc(t) + '</span>'; }).join('') +
        '</div>' +
        (pedido
          ? '<span class="inscrita" role="status">Você já está inscrita</span>'
          : '<button type="button" class="botao botao--roxo" data-mentora="' + m.id + '">Ver horários e me inscrever</button>') +
      '</div>';
    }).join(''));
  }

  function renderCadastro() {
    var st = state;
    var periodo = SLOTS[resultado(st.answers).horario];
    var ms = mentoraPorId(st.mentoraSel || 'm02');

    campo('sel-nome', ms.nome);
    campo('sel-inicial', ms.nome.charAt(0));
    campo('sel-skill', ms.skill);
    campo('sel-horario', 'Atende das ' + hh(ms.ini) + ' às ' + hh(ms.fim));
    campo('sel-linkedin', ms.linkedin);

    lista('dias', DIAS.map(function (d, di) {
      var livres = 0;
      for (var h = ms.ini; h < ms.fim; h++) if (!ocupado(ms.id, di, h)) livres++;
      return '<button type="button" class="dia" data-dia="' + di + '" aria-pressed="' + (st.dia === di) + '">' +
        '<span class="dia__semana">' + d.semana + '</span>' +
        '<span class="dia__data">' + d.data + '</span>' +
        '<span class="dia__livres">' + (livres === 1 ? '1 livre' : livres + ' livres') + '</span>' +
      '</button>';
    }).join(''));

    var slots = [];
    for (var hora = ms.ini; hora < ms.fim; hora++) {
      var oc = ocupado(ms.id, st.dia, hora);
      var on = !oc && st.slot === hora;
      var noPeriodo = hora >= periodo.ini && hora < periodo.fim;
      slots.push('<button type="button" class="horario' + (noPeriodo ? ' horario--periodo' : '') + '" data-slot="' + hora + '"' +
        (oc ? ' disabled' : '') + ' aria-pressed="' + on + '">' +
        '<span class="horario__faixa">' + hh(hora) + '–' + hh(hora + 1) + '</span>' +
        '<span class="horario__status">' + (oc ? 'Ocupado' : (on ? 'Selecionado' : (noPeriodo ? 'Seu período' : 'Livre'))) + '</span>' +
      '</button>');
    }
    lista('horarios', slots.join(''));

    var form = raiz.querySelector('[data-form="inscricao"]');
    ['fNome', 'fEmail', 'fWhats', 'fLinkedin'].forEach(function (k) {
      if (form.elements[k].value !== st[k]) form.elements[k].value = st[k];
    });

    var temSlot = st.slot != null;
    var podeConfirmar = temSlot && dadosOk();
    campo('slot-escolhido', temSlot ? DIAS[st.dia].semana + ' ' + DIAS[st.dia].data + ', ' + hh(st.slot) + ' às ' + hh(st.slot + 1) : 'nenhum ainda');
    raiz.querySelector('[data-acao="confirmar"]').disabled = !podeConfirmar;
    campo('ajuda', podeConfirmar ? 'Tudo certo! Confirme para garantir seu horário.' : 'Escolha um horário e preencha todos os campos para confirmar.');
  }

  function renderConfirmado() {
    var c = state.conf;
    if (!c) return;
    var cm = mentoraPorId(c.mentoraId);
    campo('conf-mentora', cm.nome);
    campo('conf-skill', cm.skill);
    campo('conf-quando', DIAS[c.dia].longo + ', das ' + hh(c.slot) + ' às ' + hh(c.slot + 1));
    campo('conf-nome', c.nome);
    campo('conf-email', c.email);
    campo('conf-whats', c.whats);
    campo('conf-linkedin', c.linkedin);
  }

  // ---------- Ações ----------

  var acoes = {
    comecar: function () { setState({ step: 'quiz', i: 0 }); },
    voltar: function () {
      if (state.i === 0) setState({ step: 'intro' });
      else setState({ i: state.i - 1 });
    },
    proxima: function () {
      if (state.answers[state.i] == null) return;
      if (state.i >= PERGUNTAS.length - 1) setState({ step: 'result' });
      else setState({ i: state.i + 1 });
    },
    refazer: function () {
      setState({ step: 'intro', i: 0, answers: {}, pedidos: {}, mentoraSel: null, slot: null, conf: null });
    },
    'voltar-mentoras': function () { setState({ step: 'result' }); }
  };

  function confirmar() {
    var s = state;
    if (s.slot == null || !dadosOk()) return;
    var id = mentoraPorId(s.mentoraSel || 'm02').id;
    var p = Object.assign({}, s.pedidos); p[id] = true;
    var e = Object.assign({}, s.extra); e[id] = (e[id] || 0) + 1;
    var rv = Object.assign({}, s.reservas); rv[id + '-' + s.dia + '-' + s.slot] = true;
    setState({
      step: 'confirmado', pedidos: p, extra: e, reservas: rv,
      conf: { mentoraId: id, dia: s.dia, slot: s.slot, nome: s.fNome, email: s.fEmail, whats: s.fWhats, linkedin: s.fLinkedin }
    });
  }

  raiz.addEventListener('click', function (ev) {
    var el = ev.target.closest('button');
    if (!el || el.disabled || el.type === 'submit') return;

    var acao = el.getAttribute('data-acao');
    if (acao && acoes[acao]) return acoes[acao]();

    if (el.hasAttribute('data-opcao')) {
      var a = Object.assign({}, state.answers);
      a[state.i] = Number(el.getAttribute('data-opcao'));
      return setState({ answers: a });
    }
    if (el.hasAttribute('data-mentora')) {
      return setState({ step: 'cadastro', mentoraSel: el.getAttribute('data-mentora'), dia: 0, slot: null });
    }
    if (el.hasAttribute('data-dia')) {
      return setState({ dia: Number(el.getAttribute('data-dia')), slot: null });
    }
    if (el.hasAttribute('data-slot')) {
      return setState({ slot: Number(el.getAttribute('data-slot')) });
    }
  });

  var form = raiz.querySelector('[data-form="inscricao"]');
  form.addEventListener('input', function (ev) {
    var patch = {};
    patch[ev.target.name] = ev.target.value;
    setState(patch);
  });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    confirmar();
  });

  render();
})();
