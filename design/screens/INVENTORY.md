# INVENTORY — design/source/techwoman.html × UI-SPEC

Gerado pelo teammate ui-kit. Fonte somente leitura: `design/source/techwoman.html` (3,4 MB, 586 linhas).

## Como o arquivo é montado

Bundle do Claude Design em duas camadas, ambas `gzip+base64` dentro de `<script type="__bundler/...">`:

| Camada | Onde (arquivo original) | Conteúdo |
| --- | --- | --- |
| Externa | linha 571 (`__bundler/manifest`, 3,4 MB), linha 579 (`page_order`), linha 583 (`template`) | Manifest com 8 páginas (cada uma é outro bundle), ordem das pranchas e o quadro com 8 `<iframe>` (id da página no `src="about:blank#<id>"`) |
| Interna (uma por prancha) | `__bundler/manifest` dentro de cada página decodificada | 3 scripts (React 18 UMD, runtime `DCLogic`, Babel), 7 fontes woff2 e o `__bundler/template` com o HTML da tela (estilos inline, `<sc-if>`, `<sc-for>`, `{{vars}}`) |

Fontes: Manrope (400–700) e Unbounded (500–800), licença OFL. As prancha de P6 "proposto" e "confirmada" importam o componente `MinhaMentoria` (`<dc-import name="MinhaMentoria" status="...">`, 18 KB de HTML + CSS de 615 KB de fontes embutidas), que contém TODOS os estados de P6.

Para reproduzir: decodificar a linha 571 (JSON `id -> {mime, compressed, data}`), repetir o processo no manifest de cada página e ler o `template`. Para ver renderizado: `chrome --headless=new --virtual-time-budget=8000 --screenshot` sobre a página decodificada.

## Mapa prancha → código

| Prancha no HTML | Id da página (externa) | Tamanho do quadro | Código UI-SPEC | Observação |
| --- | --- | --- | --- | --- |
| P1 · Home do evento | `546bc22c-403e-4964-8e3f-c6b387e30230` | 1440 × 3200 | P1 | Só desktop. Já tem o bloco "Mentoria" e o card "Convite recebido". Textos `[Descrição curta do Tech Woman…]`, `[Endereço do local]`, `[Organização]` são placeholders literais (devem vir de E01) |
| P2/P3 · Gamificação e resultado | `51336685-50c4-4140-9dcf-c3da26e7aefa` | 1440 × 980 | P2 + P3 | Um componente com 3 fases: intro, perguntas/desafios (7 etapas, XP) e resultado. Só desktop. CTA "Quero uma mentoria nessa área" e "Refazer a jornada" presentes |
| QR Code · cartaz da inscrição | `df804a8c-25e2-4289-bb46-da37853dc1d8` | 800 × 1120 | (sem código; peça gráfica do QR, A7/E42) | Cartaz para impressão com `techwoman.dev/cadastro`. Não é uma rota |
| P4 · Inscrição na mentoria | `6195b3de-19dd-45ad-9a9f-93010055f2b9` | 375 × 1560 | P4 | Só mobile. Prop `estado`: normal, erros, ja-inscrita, sem-rede |
| P5 · Inscrição recebida | `9356f769-5a99-46ad-a484-b944e295ad09` | 375 × 812 | P5 | Só mobile. Botão copiar com estado "Copiado ✓" |
| P6 · aguardando | `320beb46-d3e0-4931-be42-29738498e3f9` | 375 × 900 | P6 (Aguardando; contém TODOS os estados no mesmo template) | Só mobile |
| P6 · horário proposto | `fcc84b4d-c08b-4031-9a5a-d9b06a79a45d` | 375 × 1000 | P6 (Horário proposto) | `MinhaMentoria status=proposto`; contador 09:34 (vermelho nos 3 min finais) |
| P6 · confirmada | `63c26ce9-33e1-4238-a1d1-86e00a4c9870` | 375 × 900 | P6 (Confirmada) | `MinhaMentoria status=confirmada` |

Estados de P6 existentes no componente (`status`): aguardando, recusada (selo Prioridade), proposto, confirmada, expirada, concluida, cancelada, invalido. Falta no HTML: "Não compareceu" (UI-SPEC o agrupa com Cancelada; usar o texto neutro de Cancelada).

## Telas do UI-SPEC sem arte no HTML (FALTAM)

15 das 21 telas não existem no arquivo:

- M1 Login · M2 Primeiro acesso/troca de senha · M3 Minha disponibilidade · M4 Participantes aguardando · M5 Agendar mentoria (gaveta/modal) · M6 Minha agenda
- A1 Dashboard · A2 Mentoras · A3 Cadastro de mentora e importação · A4 Participantes · A5 Mapa de mesas · A6 Mesas · A7 Configurações do evento · A8 Administradores · A9 Notificações e auditoria

Também não existem na arte os componentes: Selo de prioridade como componente isolado (existe só inline em P6), seletor de horário, seletor de mesa, faixa de conexão "Reconectando…" (só o "Atualizado agora" de P6), toast, tabela com filtros, revelação única de senha, skeleton, estados vazio/erro/sem permissão/sessão expirada.

Decisão do ui-kit: M1–M6 e A1–A9 serão DERIVADAS do UI-SPEC com os tokens e componentes extraídos (mesma identidade). Cada `design/screens/<codigo>.html` dessas telas leva o aviso "derivada do UI-SPEC, sem arte do Claude Design".

## Telas existentes com um só breakpoint

| Tela | Desenhada em | Falta derivar |
| --- | --- | --- |
| P1, P2, P3 | 1440 | 375 (o site atual em `css/`/`js/` na raiz já é responsivo; usar como guia) |
| P4, P5, P6 | 375 | 1280 (centralizar coluna única de até 480 px sobre o fundo `--color-bg`; no desktop o header ocupa a largura toda) |

## Códigos RN e E citados no HTML

Varredura (regex `\b(RN|E)-?[0-9]{2}\b`) sobre: arquivo externo bruto, as 8 páginas decodificadas, os 8 templates, scripts (React/Babel/runtime) e CSS embutidos.

Resultado: **0 ocorrências** de RNxx ou Exx. Nenhuma tela do HTML cita regra ou endpoint; a ligação com RN01–RN17 e E01–E45 é toda responsabilidade do PLAN. Tabela vazia, portanto, e nada a registrar como "não existe/não bate" por código.

Referências ao Bradesco (nome, logo, cor, domínio): **0** em todo o conteúdo decodificado.

## Divergências de regra encontradas lendo o conteúdo (não são códigos RN citados)

Para o Felipe decidir; ninguém implementa nada fora do PLAN até a decisão.

1. **Prazo do convite (RN05).** O design mostra sessão às 14h15 com "Responda até 14h05" (10 min antes do início, P1 card de exemplo e P6). RN05 define `expiresAt = min(agora + 15 min, início − 5 min)`, ou seja, 14h10 para esse caso. Texto "Se você não responder até 14h05…" e contador precisam usar o `expiresAt` da API; o exemplo de arte é só ilustrativo.
2. **"Expirada" como status (RN07).** O componente P6 tem o selo "Expirada" em vermelho suave e o UI-SPEC lista "Proposta expirada". Em RN07 a participante volta para `waiting` ao expirar; a tela deve exibir a mensagem "O prazo… você continua na fila" como aviso (a partir do evento/status devolvido por E03), sem tratar como estado terminal.
3. **Cancelamento pela participante.** O design (P6) pede confirmação ("Cancelar mesmo? Sua inscrição sai da fila e a mentora é avisada."), que o UI-SPEC não descreve. Mantido na implementação por fidelidade.
4. **Recusa "Não tenho mais interesse"** leva a Cancelada no design, coerente com RN06 (encerra).
5. **Áreas hardcoded.** P4 e o resultado usam 6 áreas fixas: Backend, Frontend, Dados, UX & Design, Produto, Cloud & Infraestrutura. UI-SPEC lista "áreas finais" como pendência; o front deve ler as áreas de E01/A7 e usar estas só como fallback.
6. **Períodos.** Manhã, Início da tarde, Fim da tarde, Qualquer horário: bate com UI-SPEC P4 e RN14.
7. **Links internos do HTML** apontam para arquivos do protótipo (`Jornada.dc.html`, `Inscricao.dc.html`, `InscricaoOk.dc.html`, `MinhaMentoria.dc.html`, `Main.dc.html`); mapeamento para rotas: Jornada → `/jornada`, Inscricao → `/mentoria/inscricao`, InscricaoOk → `/mentoria/inscricao/ok`, MinhaMentoria → `/mentoria/minha?t=`, Main → `/`.
8. **Texto "Mentoria · 14/11" no header** de P4/P5 e "Minha mentoria" em P6 são fixos na arte; data deve vir de E01.

## Pendências para o Felipe

- Gerar no Claude Design (ou aprovar derivação) de M1–M6 e A1–A9.
- Versões mobile de P1–P3 e desktop de P4–P6.
- Confirmar prazo exibido do convite (item 1).
- Preencher placeholders de P1 (descrição do evento, endereço, organização, programação).
- Lista final de áreas, texto LGPD e controladora, foto da mentora, avaliação pós-mentoria (já listados em "Pendências de UI" do UI-SPEC).
