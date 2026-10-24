# Inventário dos e-mails (mockup -> placeholders do PLAN)

Fonte: `design/email/source/Emails.dc.html` (somente leitura). Produção: `src/api/notifications/templates/email/`.
Cada e-mail abaixo tem `.html` + `.txt` gerados por `build.mjs` a partir de `emails.mjs` (conteúdo) e `layout.mjs` (tabelas + CSS, inlinado com juice).

## Dados fixos comuns (todos os e-mails)

| Mockup | Placeholder | Onde |
| --- | --- | --- |
| "Sábado, 14/11 · Recife" | `{{evento_data}}` · `{{evento_local}}` | cabeçalho (ver Lacunas 1) |
| "Tech Woman" (rodapé, negrito) | `{{evento_nome}}` | rodapé |
| "Sábado, 14 de novembro de 2026" | `{{evento_data}}` | rodapé |
| "Recife" | `{{evento_local}}` | rodapé |
| "Aviso de privacidade" (sem href) | `href="{{link_privacidade}}"` | rodapé |
| `techwoman.dev/mentoria/minha?t=8f3k2q` | `{{link_minha_mentoria}}` (ou `link_login` no 06) | link de fallback |
| (nenhum) | `{{ano}}` | sem lugar no layout (Lacunas 3) |

## Por e-mail

| # | Dado fixo do mockup | Placeholder |
| --- | --- | --- |
| 01 | "Joana" (título) | `{{nome}}` |
| 01 | botão "Acompanhar minha mentoria" (sem href) | `href="{{link_minha_mentoria}}"` |
| 02 | "Joana" (texto) | `{{nome}}` |
| 02 | "Ana" (texto e card MENTORA) | `{{mentora_nome}}` |
| 02 | card MESA "7" | `{{mesa}}` (ver Lacunas 4) |
| 02 | card HORÁRIO "14h15" | `{{horario}}` |
| 02 | "14h05" (preheader e destaque) | `{{prazo}}` |
| 02 | botão "Ver convite e confirmar" | `href="{{link_minha_mentoria}}"` |
| 03 | "Joana" (título) | `{{nome}}` |
| 03 | card MESA "7", HORÁRIO "14h15", MENTORA "Ana" | `{{mesa}}`, `{{horario}}`, `{{mentora_nome}}` |
| 03 | botão "Adicionar à agenda" | `href="{{link_agenda}}"` (E06) |
| 03 | botão secundário "Ver minha mentoria" | `href="{{link_minha_mentoria}}"` |
| 03 | nota "Sábado, 14/11 · sessão de 40 minutos · horário de Recife." | `{{evento_data}} · sessão de 40 minutos · horário de Recife.` |
| 04 | "Joana" (texto) | `{{nome}}` |
| 04 | botão "Ver minha inscrição" | `href="{{link_minha_mentoria}}"` |
| 05 | "Joana", "14h15" (texto) | `{{nome}}`, `{{horario}}` |
| 05 | botão "Acompanhar minha mentoria" | `href="{{link_minha_mentoria}}"` |
| 06 | "Ana" (título) | `{{mentora_nome}}` |
| 06 | card LOGIN "ana@email.com" | `{{email_login}}` |
| 06 | card SENHA PROVISÓRIA "lilas-mesa-3851" | `{{senha_provisoria}}` |
| 06 | botão "Entrar na área da mentora"; link de fallback `techwoman.dev/entrar` | `href="{{link_login}}"`; `{{link_login}}` |

## Assuntos: mockup x PLAN (o PLAN vale; está em `subjects.ts`)

| # | Mockup | PLAN (usado) |
| --- | --- | --- |
| 01 | Recebemos sua inscrição na mentoria Tech Woman | Recebemos sua inscrição na mentoria do Tech Woman |
| 02 | Ana quer te mentorar às 14h15 | {{mentora_nome}} quer te mentorar às {{horario}} (igual) |
| 03 | Combinado! 14h15 na Mesa 7 com Ana | Combinado: {{horario}} na {{mesa}}; moved "Sua mentoria mudou"; reminder "Sua mentoria começa às {{horario}}" |
| 04 | O prazo do convite terminou | O prazo para confirmar sua mentoria terminou |
| 05 | Sua mentoria das 14h15 foi cancelada | Sua mentoria das {{horario}} foi cancelada (igual) |
| 06 | Seu acesso à área da mentora Tech Woman | Seu acesso ao painel de mentoras do Tech Woman |

Preheaders do mockup foram mantidos; só o do 02 usa placeholder (`{{prazo}}`).

## Lacunas (não redesenhado; decidir com "main")

1. **Data curta no cabeçalho.** O mockup usa "Sábado, 14/11" no cabeçalho e a data longa no rodapé; o PLAN só tem `evento_data`. O cabeçalho usa `{{evento_data}}` (forma longa). Para a forma curta seria preciso nova variável (ex.: `evento_data_curta`).
2. **Resolvida (opção A aprovada):** `mentora_linkedin` (02) é o href do nome da mentora no texto (link sublinhado, cor #8A1F96; no .txt sai "Ana (url)"); `validade_senha` (06) entra no destaque: "No primeiro acesso você cria uma senha nova. A senha vale {{validade_senha}}.". Desvio mínimo do mockup, aprovado.
3. **`ano`** (comum) não tem lugar; o ano só aparece dentro de `evento_data`.
4. **`mesa`**: o assunto do 03 ("na {{mesa}}") exige "Mesa 7", mas o card do mockup mostra "7" sob o rótulo MESA. Os templates exibem o valor de `mesa` como veio (card "MESA / Mesa 7", levemente redundante). Alternativa: backend fornecer só "7" e o assunto montar "Mesa {{mesa}}" (mudaria o PLAN).
5. **Layout 3 reutilizado para `moved` e `reminder`:** selo "CONFIRMADA", título "Combinado, {{nome}}!" e texto "Sua mentoria está confirmada" ficam iguais; não há variante de texto no mockup nem no PLAN.
6. **Rodapé do 06** diz "porque se inscreveu na mentoria do evento" (texto do mockup, comum aos 6); não se aplica a mentora.
7. **Formas decorativas do cabeçalho** (círculo, quadrado arredondado, meio-arco): feitas com células de tabela e `border-radius` (sem imagens, nada em `src/web/public/email/`). Em Outlook desktop viram quadrados; em Gmail/Apple Mail/Outlook web ficam como no design. PNG/SVG não compensam: SVG é bloqueado no Gmail e PNG ficaria desfocado/exigiria hospedagem.
8. **Fontes** Unbounded/Manrope via Google Fonts; clientes que bloqueiam caem para Arial Black / Arial. Degradê do cabeçalho tem cor sólida `#6E1A78` de fallback.

## Formato dos arquivos

- `fixtures/sample-data.json`: `{ common: {...}, templates: { "<id>": {...variáveis próprias} } }`; mesclar `common` + `templates[id]`.
- Escape: o worker escapa HTML nos valores do `.html`; no `.txt` os valores entram crus. Assuntos são texto puro (sem escape HTML).
