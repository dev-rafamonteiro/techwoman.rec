# SDD 1 — UI: Mentoria Tech Woman (Painel e Cadastro)

Oct 23, 2026 · @Felipe

## Contexto e escopo

Este SDD define as telas que faltam para a mentoria do Tech Woman (Recife, sábado 14/11/2026, a partir das 9h): inscrição da participante, painel da mentora e painel de super admin. Ele vai para o Claude Design gerar as telas; o comportamento por trás de cada botão está no SDD 2 (Funcional e Backend), referenciado aqui pelos códigos de endpoint **E-xx**.

**O que já existe e fica:** página inicial do evento e a jornada de gamificação que indica a área de afinidade da participante. Essas telas recebem só ajustes pontuais (CTA para a mentoria).

**O que é novo:**

- Pagina com QR Code para que leva a pessoa para Inscrição na mentoria (<http://techwoman.dev/cadastro>)
- Página pessoal "Minha mentoria", onde a participante acompanha e confirma o horário.
- Painel da mentora: disponibilidade, lista de participantes aguardando, agendamento (mesa + horário) e "Minha agenda".
- Painel de super admin: cadastro de mentoras, participantes, mapa de mesas, configuração do evento e administradores.

**Decisões já tomadas na conversa de mapeamento (23/10):**

| Tema | Decisão |
| --- | --- |
| Quem escolhe a mentorada | A mentora escolhe, na lista de aguardando. Não há round robin. |
| Login de mentora | Só para as \~50 mentoras da lista oficial, cadastradas pelo admin. Sem autocadastro. |
| Duração da sessão | 40 minutos, em grade fixa de horários. |
| Mesas | 20 mesas, 2 cadeiras cada, quantidade configurável. |
| Horário da participante | Ela informa só uma preferência; o horário real vem da mentora e precisa da confirmação dela. |
| Recusa por horário | A participante volta para a fila marcada como prioridade. |
| Marca | Nenhuma referência ao Bradesco em nenhuma tela, exceto o logo de patrocínio no bloco "Quem faz o Tech Woman" da P1. |

**Como usar com o Claude Design:** gerar as telas na ordem P4–P6, M1–M6, A1–A9; cada tela abaixo traz rota, quem acessa, conteúdo, ações, estados e o endpoint que alimenta cada ação.

## Diretrizes visuais e de experiência

As telas novas seguem a identidade visual da arte do Tech Woman já aplicada no site (roxo, laranja e menta) e não podem conter nome, logo, cor institucional ou domínio do Bradesco, exceto o logo de patrocínio no bloco "Quem faz o Tech Woman" da P1.

- **Mobile first para participante e mentora.** A participante chega pelo QR Code no celular; a mentora opera da mesa, provavelmente pelo celular. Largura de referência 375 px; nada pode exigir rolagem horizontal.
- **Desktop first para o super admin**, mas utilizável em tablet no dia do evento (balcão de apoio).
- **Idioma pt-BR**, tom acolhedor e direto. Horários sempre no formato 14h20 e com a indicação "horário de Recife" onde houver confirmação.
- **Acessibilidade:** contraste AA, alvos de toque de 44 px, foco visível, rótulos em todos os campos, status nunca indicado só por cor (sempre cor + texto).
- **Tempo real perceptível:** na lista de aguardando, uma participante escolhida por outra mentora some com uma animação curta e um aviso discreto, em vez de simplesmente desaparecer.
- **Componentes do mesmo design system nas três áreas** (participante, mentora, admin); o admin pode ser mais denso, com tabelas e filtros.
- **Cores de status (com texto):** Aguardando = neutro · Horário proposto = laranja · Confirmada = menta · Concluída = cinza · Não compareceu / Cancelada = vermelho suave · Prioridade = selo roxo.

## Perfis de acesso e mapa de navegação

São quatro perfis; só a participante não tem login. Ela acessa a própria página por um link pessoal enviado na inscrição.

| Perfil | Como entra | O que vê |
| --- | --- | --- |
| Participante | QR Code / link público; depois, link pessoal | Home, gamificação, inscrição, Minha mentoria |
| Mentora | E-mail e senha criados pelo admin | Disponibilidade, Aguardando, Minha agenda |
| Admin (operação) | E-mail e senha criados pelo super admin | Tudo do painel, exceto Configurações do evento e Administradores |
| Super admin | E-mail e senha (conta inicial criada na implantação) | Tudo |

Ao fazer login, o sistema redireciona pelo perfil: mentora para `/mentora/aguardando`, admin e super admin para `/admin`. Um usuário com os dois papéis (ex.: organizadora que também mentora) vê um seletor "Painel admin / Área da mentora" no menu.

| Código | Tela | Rota | Perfil | Situação |
| --- | --- | --- | --- | --- |
| P1 | Home do evento | `/` | Público | Existe, ajustar CTA |
| P2 | Gamificação | `/jornada` | Público | Existe |
| P3 | Resultado da gamificação | `/jornada/resultado` | Público | Existe, ajustar CTA |
| P4 | Inscrição na mentoria | `/mentoria/inscricao` | Público | Nova |
| P5 | Inscrição recebida | `/mentoria/inscricao/ok` | Público | Nova |
| P6 | Minha mentoria | `/mentoria/minha?t=<token>` (as mensagens e P5 levam para cá pelo link curto `/l/<código>`, E48) | Participante (link pessoal) | Nova |
| M1 | Login | `/entrar` | Mentora, admin | Nova |
| M2 | Primeiro acesso / troca de senha | `/entrar/nova-senha` | Mentora, admin | Nova |
| M3 | Minha disponibilidade | `/mentora/disponibilidade` | Mentora | Nova |
| M4 | Participantes aguardando | `/mentora/aguardando` | Mentora | Nova |
| M5 | Agendar mentoria | painel sobre M4 | Mentora | Nova |
| M6 | Minha agenda | `/mentora/agenda` | Mentora | Nova |
| A1 | Dashboard | `/admin` | Admin, super admin | Nova |
| A2 | Mentoras | `/admin/mentoras` | Admin, super admin | Nova |
| A3 | Cadastro de mentora e importação | `/admin/mentoras/nova`, `/admin/mentoras/:id`, `/admin/mentoras/importar` | Admin, super admin | Nova |
| A4 | Participantes | `/admin/participantes` | Admin, super admin | Nova |
| A5 | Mapa de mesas | `/admin/mapa` | Admin, super admin | Nova |
| A6 | Mesas | `/admin/mesas` | Super admin | Nova |
| A7 | Configurações do evento | `/admin/evento` | Super admin | Nova |
| A8 | Administradores | `/admin/usuarios` | Super admin | Nova |
| A9 | Notificações e auditoria | `/admin/logs` | Admin, super admin | Nova |

**Menu da mentora (barra inferior no celular):** Aguardando · Minha agenda · Disponibilidade · Sair.

**Menu do admin (lateral):** Dashboard · Participantes · Mapa de mesas · Mentoras · Mesas · Evento · Administradores · Logs. Itens sem permissão não aparecem.

## Telas da participante (P1–P6)

A jornada é QR Code → gamificação → resultado → inscrição → link pessoal, onde ela confirma o horário proposto pela mentora.

### P1 · Home do evento (ajuste)

- Incluir o bloco "Mentoria": como funciona em 3 passos (descubra sua área, inscreva-se, aguarde o convite de uma mentora), sessões de 40 min, mesas no local.
- CTA principal "Começar minha jornada" leva a P2. Texto de apoio: "A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras."
- Dados de data, local e horário vêm de **E01**.
- Conteúdo do evento, tirado da página oficial (Jalan, `https://app.jalanlive.com/techwoman26/home`):
  - Hero: título "Conectar mulheres, tecnologia e futuros possíveis" e o resumo "O Tech Woman é um movimento que nasceu para ampliar a presença feminina no universo da tecnologia e da inovação, fortalecendo a representatividade, o desenvolvimento profissional e as conexões entre mulheres." Link secundário "Garanta seu ingresso" para a página oficial (o ingresso do evento é vendido lá; a inscrição na mentoria é separada e gratuita).
  - Bloco "O evento": cartões Quando, Onde e Para quem, seguidos das cinco trilhas de conhecimento, cada uma com nome e uma frase: Carreiras, Técnica, Soft Skills, Empreendedorismo, Tecnologia para quem não é da tecnologia.
  - Faixa final: frase "Você não precisa trabalhar com tecnologia para fazer parte dessa transformação." acima do CTA.
  - Bloco "Local": nome do local (E01 `location`), endereço "Cais Santa Rita, 156 - São José, Recife - PE" e botão "Ver no mapa" (Google Maps, nova aba). Endereço e link são constantes da página, não vêm da API.
  - Rodapé: Instagram, LinkedIn, YouTube e o e-mail contato@techwoman.rec.br, além dos links atuais.
- Bloco "Quem faz o Tech Woman" (`id="quem-faz"`), logo acima do rodapé, fundo roxo escuro #3D0A45: título laranja, sobretítulo "Realização" com o logo da Combogó Eventos sozinho e centralizado, divisor fino e sobretítulo "Patrocínio" com Instituto Claro, Bradesco e MongoDB numa linha centralizada que quebra no celular (espaço de 56 px; 32 px abaixo de 600 px). Arquivos oficiais em off-white em `/brand/patrocinadores/` (sem link, sem recolorir). Alturas desktop / celular: Combogó 72/56, Instituto Claro 64/48, Bradesco 52/40, MongoDB 48/36 px.

### P2 · Gamificação (existente)

Sem mudança de layout. Ao terminar, guarda o resultado (área principal e pontuação por área) para enviar na inscrição.

### P3 · Resultado (ajuste)

- Mantém o resultado atual e acrescenta o CTA "Quero uma mentoria nessa área" para P4, com a área já preenchida.
- Link secundário "Refazer a jornada".

### P4 · Inscrição na mentoria (nova)

Formulário de uma coluna, curto, pensado para preencher em pé no evento.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| Nome completo | Texto | Sim |  |
| E-mail | E-mail | Sim | Uma inscrição por e-mail |
| WhatsApp | Telefone com DDD | Sim | Máscara (00) 00000-0000 |
| LinkedIn | URL | Não | Aceita só o usuário ou a URL completa |
| Área de interesse | Seleção | Sim | Pré-preenchida com o resultado de P3; editável |
| Período preferido | Opções | Sim | Manhã, Início da tarde, Fim da tarde, Qualquer horário |
| Comentário para a mentora | Texto curto, 280 caracteres | Não | "O que você quer conversar?" |
| Consentimento LGPD | Caixa de seleção | Sim | Link para o aviso de privacidade |

- Abaixo do período: "É só uma preferência. O horário final é definido pela mentora e você confirma."
- Verificação anti-robô invisível (Cloudflare Turnstile) antes de enviar.
- Botão "Quero ser mentorada" envia para **E02**.
- Estados: validação por campo em tempo real; e-mail já inscrito mostra "Você já tem uma inscrição. Enviamos de novo o link da sua página para seu e-mail" (o reenvio também é **E02**); falha de rede mantém os dados preenchidos.

### P5 · Inscrição recebida (nova)

- Mensagem: "Recebemos sua inscrição! Em breve uma mentora vai propor um horário e uma mesa. Você vai receber o aviso por e-mail e WhatsApp."
- Botão "Acompanhar minha mentoria" abre P6 (navegação interna pelo `personalPath` de **E02**).
- Sugestão "Salve este link" com botão copiar: mostra e copia o link curto (origem do site + `shortPath` de **E02**, ex.: `https://techwoman.dev/l/IEO31Kd`). `personalPath` e `shortPath` ficam juntos no estado da navegação e no `sessionStorage`, para P5 continuar certa depois de recarregar.

### P6 · Minha mentoria (nova, link pessoal)

Página única que muda conforme o status vindo de **E03**; atualiza sozinha a cada 30 s e no foco da aba.

| Status | O que mostra | Ações |
| --- | --- | --- |
| Aguardando mentora | Área, período preferido, posição neutra ("Sua inscrição está ativa") | Editar período preferido; Cancelar inscrição (**E04**) |
| Horário proposto | Card com mentora (nome, foto opcional, LinkedIn), mesa, horário, duração 40 min e contador "Responda até 14h05" | Aceitar; Recusar com motivo: Horário não serve / Não tenho mais interesse (**E04**) |
| Confirmada | Card destacado: "Mesa 7 · 14h20 · com Ana" e "Chegue 5 minutos antes" | Adicionar à agenda (.ics via E06); Cancelar (**E04**): abre a escolha "Trocar de horário" (`reschedule`, RN19: cancela esta mentoria, volta à fila com prioridade e mostra os horários livres) ou "Não tenho mais interesse" (`cancel`, encerra a inscrição) |
| Recusada por horário (inclui quem trocou de horário ou disse "Não poderei ir" no WhatsApp) | "Tudo bem! Sua inscrição continua ativa e com prioridade." e o bloco "Escolha um novo horário": horários livres de **E07** (componente de horários, os do período preferido destacados); tocar num horário pede confirmação "Confirmar mentoria às 14h20?" e chama **E08**; sucesso vira o estado Confirmada. Sem horários: "Nenhum horário livre agora. Você continua na fila com prioridade e uma mentora pode te chamar." 409 `SLOT_UNAVAILABLE`: "Esse horário acabou de ser ocupado. Escolha outro." e recarrega a lista | Escolher horário (**E07**, **E08**); Editar período preferido |
| Proposta expirada | "O prazo para responder terminou e o horário foi liberado. Você continua na fila." | — |
| Concluída | Agradecimento e link de avaliação (se houver) | — |
| Não compareceu / Cancelada | Mensagem neutra | Fazer nova inscrição, se o evento ainda estiver aberto |
| Link inválido | "Não encontramos sua inscrição" | Reenviar link por e-mail (**E05**) |

## Telas da mentora (M1–M6)

A mentora monta a disponibilidade, escolhe quem vai mentorar na lista de aguardando, define mesa e horário, e acompanha tudo em "Minha agenda".

### M1 · Login

- Campos e-mail e senha, botão "Entrar" (**E10**). Link "Esqueci minha senha" mostra: "Procure a organização no balcão de apoio" (reset é feito pelo admin).
- Erros: credencial inválida (mensagem genérica), conta desativada, muitas tentativas (bloqueio de 5 min).
- Compartilhada com admin e super admin; o redirecionamento é pelo perfil (**E12**).

### M2 · Primeiro acesso / troca de senha

- Aparece obrigatoriamente no primeiro login com senha provisória.
- Campos: nova senha, confirmar senha; regras visíveis (mínimo 10 caracteres). Envia para **E13**.
- Na mesma tela, a mentora confere nome, LinkedIn, foto (opcional) e áreas de atuação (**E28**).

### M3 · Minha disponibilidade

- Grade vertical com todos os horários do dia (ex.: 9h00, 9h45, 10h30… definidos em A7). Cada horário é um botão liga/desliga "Disponível".
- Atalhos: "Manhã inteira", "Tarde inteira", "Limpar".
- Horário com mentoria já marcada aparece travado, com o nome da participante; não pode ser desligado sem antes cancelar a mentoria em M6.
- Salvar envia para **E21** (carga inicial via **E20**). Aviso se a mentora tentar entrar em M4 sem nenhum horário disponível.

### M4 · Participantes aguardando

Tela principal da mentora no dia.

- **Cabeçalho:** contador "Seus horários livres hoje: 6" e próximo atendimento ("14h20 · Mesa 7 · Joana").
- **Filtros:** área (multi), período preferido, "Só prioridade" e busca livre por nome ou assunto do comentário (ex.: "transição de carreira"), que ignora acentos e tolera pequenos erros de digitação. Padrão: filtrar pelas áreas da mentora, com opção "Ver todas".
- **Card da participante:** nome, área (selo), período preferido, LinkedIn (abre em nova aba), comentário, tempo de espera ("inscrita há 25 min") e selo "Prioridade" quando recusou um horário antes. E-mail e telefone **não** aparecem para a mentora.
- **Ordenação:** prioridade primeiro, depois inscrição mais antiga. Com busca livre, a lista vem ordenada pela relevância da busca (até 50 itens) e o selo "Prioridade" continua visível. Se a busca falhar, mostrar o estado de erro com "tentar de novo".
- **Ação:** botão "Mentorar" abre M5.
- **Tempo real:** cards entram e saem sozinhos (**E27**). Se a participante for escolhida por outra mentora enquanto esta olha, o card some com aviso "Joana acabou de ser escolhida por outra mentora".
- Dados: **E22**. Estados: carregando (esqueleto), lista vazia ("Ninguém aguardando agora"), sem conexão (faixa "Reconectando…").

### M5 · Agendar mentoria (painel sobre M4)

Gaveta de baixo para cima no celular, modal no desktop.

- Resumo da participante no topo.
- **Horário:** lista só dos horários em que a mentora está disponível e livre, com o período preferido da participante destacado como "Preferência dela".
- **Mesa:** lista das mesas livres naquele horário; a mesa usada pela mentora no horário anterior vem pré-selecionada com a dica "Mantenha a mesma mesa para não precisar trocar de lugar".
- Opções carregadas por **E23** a cada troca de horário.
- Botão "Enviar convite" (**E24**). Texto de apoio: "Ela tem até 15 min para confirmar; se não confirmar, o horário volta a ficar livre."
- **Conflitos (resposta 409 de E24), com mensagem e ação:**
  - Participante já escolhida: "Outra mentora acabou de convidar a Joana", fecha o painel e atualiza M4.
  - Mesa ocupada: "A Mesa 7 acabou de ser ocupada nesse horário", recarrega as mesas.
  - Horário da mentora ocupado: "Você já tem uma mentoria às 14h20", recarrega os horários.

### M6 · Minha agenda

- Linha do tempo do dia, um card por horário da mentora: livre, convite enviado (aguardando confirmação, com contador), confirmada, concluída, não compareceu.
- **Card confirmado:** nome, área, mesa, horário, LinkedIn, comentário.
- **Ações por card (E26):**
  - Convite enviado: "Cancelar convite"; "Confirmar presencialmente" (quando a participante está na mesa e não conseguiu confirmar pelo celular).
  - Confirmada: "Iniciar" / "Concluir", "Não compareceu" (liberado 10 min após o início), "Cancelar" com motivo.
- Destaque visual da próxima mentoria e aviso "Começa em 5 min".
- Dados: **E25**, atualização em tempo real por **E27**.

## Telas do super admin (A1–A9)

O painel admin cadastra as mentoras antes do evento e, no dia, acompanha a fila, as mesas e intervém quando algo trava.

### A1 · Dashboard

- **Indicadores (E30):** inscritas, aguardando, convites pendentes, confirmadas, concluídas, não compareceu, ocupação das mesas agora (ex.: 14/20), capacidade restante do dia (sessões livres), mentoras com login feito / total.
- Gráfico de barras "Inscritas por área" e linha "Inscrições por hora".
- Lista "Precisa de atenção": convites prestes a expirar, mesas com mentoria atrasada, participantes com prioridade há mais de 30 min na fila.
- Atualização automática a cada 15 s.

### A2 · Mentoras (lista)

- Tabela: nome, e-mail, organização (uso interno, nunca exibido à participante), áreas, horários disponíveis, mentorias (confirmadas/concluídas), último acesso, status (Ativa / Desativada / Nunca acessou).
- Busca livre por nome, e-mail, área ou tema da bio; filtro por status e área. Ações em linha: Editar, Redefinir senha, Ativar/Desativar, Ver agenda.
- Botões "Nova mentora" e "Importar lista (CSV)".
- Dados: **E31**.

### A3 · Cadastro de mentora e importação

**Formulário (nova ou edição, E31/E32):** nome completo, e-mail (login), LinkedIn, organização, áreas de atuação (multi), mini bio (opcional, 200 caracteres), foto (opcional), disponibilidade inicial (mesma grade de M3), papel extra "Também é admin" (só super admin vê).

- Ao salvar uma nova mentora, o sistema gera a senha provisória e mostra uma única vez, com opções "Copiar" e "Enviar por e-mail" (layout de e-mail "Acesso da mentora", senha válida por 72 h). A mentora troca no primeiro acesso (M2).
- **Redefinir senha (E34):** confirma e mostra a nova senha provisória uma única vez.

**Importação (E33):** passo 1, baixar modelo CSV (nome, email, linkedin, organizacao, areas, disponibilidade); passo 2, enviar arquivo; passo 3, prévia com linha a linha válida, com erro (e-mail duplicado, formato) ou já existente (atualizar/ignorar); passo 4, confirmar e baixar o CSV com as senhas provisórias geradas.

### A4 · Participantes

- Tabela: nome, e-mail, WhatsApp, área, período preferido, status, prioridade, mentora, mesa, horário, inscrita em.
- Filtros por status, área, prioridade e período; busca livre por nome, e-mail, telefone ou assunto do comentário.
- Detalhe em painel lateral: dados completos, linha do tempo de eventos (inscrição, convite, recusa, confirmação…) e notificações enviadas.
- **Ações (E36):** marcar/desmarcar prioridade, cancelar inscrição, reenviar link pessoal, agendar manualmente (abre o mesmo componente de M5 escolhendo também a mentora).
- Exportar CSV (**E37**) com os filtros aplicados.
- Dados: **E35**.

### A5 · Mapa de mesas

- Grade com mesas nas colunas e horários nas linhas (20 × 12 na configuração padrão). Cada célula mostra mentora + participante e o status em cor + texto; célula vazia = livre.
- Linha do horário atual destacada; seletor "Agora / Dia inteiro".
- Clique na célula abre o detalhe com ações (**E39**): mover para outra mesa ou horário, cancelar, marcar não compareceu, confirmar presencialmente.
- Dados: **E38**, em tempo real.

### A6 · Mesas (super admin)

- Lista com número/nome da mesa, localização opcional ("Área B"), ativa/inativa. Botões "Adicionar mesa" e "Gerar 1 a N".
- Desativar uma mesa com mentorias futuras exige realocá-las antes (a tela lista quais). Dados: **E40**.

### A7 · Configurações do evento (super admin)

- Nome, data, local, fuso (America/Recife), hora de início e de fim, duração da sessão (40 min), intervalo entre sessões (5 min). Prévia ao vivo da grade de horários gerada.
- Prazo para a participante responder ao convite (15 min) e antecedência mínima para convite (10 min antes do horário).
- Lembretes antes da mentoria: lista de até 10, cada um com minutos antes do início (1 a 1440) e canais (E-mail, WhatsApp); "+ Adicionar lembrete" e remover. Padrão: 15 min pelo WhatsApp. Sem WhatsApp disponível, vai por e-mail.
- Menus do WhatsApp (List Message), dois blocos: "Convite (menu do WhatsApp)" e "Confirmação de presença (menu do WhatsApp)". Cada um tem dois campos editáveis, Título e Texto (`events.whatsappLists`), e ao lado uma prévia ao vivo no estilo do WhatsApp com o rodapé "Se preferir, responda SIM ou NÃO", o botão "Responder" e as duas opções, fixos e não editáveis (convite: "Aceito" / "Não posso"; presença: "Sim, confirmo" / "Não poderei ir"), com a nota "As opções e o rodapé são fixos: as respostas da participante dependem deles." Variáveis do convite: {nome} {mentora} {horario} {mesa} {prazo} {link}; da presença: {nome} {mentora} {horario} {mesa} {minutos} {link}. Na prévia, as variáveis aparecem com dados de exemplo.
- Nos textos do WhatsApp, "Convite de horário" leva a nota "Usado quando o WhatsApp sai em texto simples (sem menu)" e "Lembrete" leva "Usado nos lembretes depois do primeiro; o primeiro pelo WhatsApp vai como menu de presença".
- Inscrições abertas / fechadas (interruptor), áreas disponíveis (lista editável), textos do WhatsApp e assuntos dos e-mails, com variáveis {nome}, {mentora}, {mesa}, {horario} (no lembrete, também {minutos}); botão "Prévia dos e-mails" que abre cada um dos 7 layouts com dados de exemplo (E46). O HTML dos e-mails é fixo no código.
- QR Code da página de inscrição: visualizar e baixar PNG/SVG para impressão.
- Alterar a grade com mentorias já marcadas é bloqueado. Dados: **E41**, QR Code: **E42**.

### A8 · Administradores (super admin)

- Tabela de usuários com papel admin ou super admin; criar, desativar, redefinir senha, trocar papel (**E43**).
- Um super admin não pode remover o próprio papel nem desativar o último super admin.

### A9 · Notificações e auditoria

- Aba **Notificações (E44):** canal, destinatária, modelo, status (na fila, enviada, falhou), tentativas e botão "Reenviar".
- Aba **Auditoria (E45):** quem fez o quê e quando (login, cadastro de mentora, convite, cancelamento, override do admin), com filtro por usuário e ação.

## Componentes, estados e mensagens padrão

Os componentes abaixo se repetem entre as três áreas e devem ser desenhados uma vez só.

| Componente | Onde aparece | Variações |
| --- | --- | --- |
| Selo de status | P6, M4, M6, A4, A5 | Aguardando, Horário proposto, Confirmada, Concluída, Não compareceu, Cancelada, Expirada |
| Selo de prioridade | M4, A4 | Único (roxo, ícone + texto) |
| Card de participante | M4, M5, M6 | Compacto (lista), completo (painel) |
| Seletor de horário | M3, M5, A3, A4 | Liga/desliga (disponibilidade), escolha única (agendamento) |
| Seletor de mesa | M5, A5 | Com mesa sugerida |
| Contador regressivo | P6, M6, A1 | Normal; vermelho nos 3 min finais |
| Faixa de conexão | M4, M6, A5 | "Reconectando…", "Atualizado agora" |
| Toast | Todas | Sucesso, erro, conflito (com ação "Atualizar") |
| Tabela com filtros | A2, A4, A9 | Com exportar CSV |
| Revelação única de senha | A3, A8 | Campo mascarado, "Copiar", aviso "Não será mostrada de novo" |

**Estados obrigatórios em toda tela com dados:** carregando (esqueleto), vazio (texto + próxima ação), erro (mensagem + tentar de novo), sem permissão ("Você não tem acesso a esta área"), sessão expirada (volta para M1 mantendo a rota de retorno).

**Mensagens enviadas: o e-mail usa os 7 layouts HTML (SDD 2, Notificações > Layouts de e-mail); o WhatsApp usa os textos abaixo, editáveis em A7. Em todos, `{link}` (e `link_minha_mentoria` / `link_agenda` nos e-mails) é o link curto `<PUBLIC_BASE_URL>/l/<código>` (SDD 2, Notificações > Links curtos). `{link_inscricao}` (e `link_inscricao` no e-mail) é `<PUBLIC_BASE_URL>/mentoria/inscricao` (P4, sem token):**

| Momento | Canal | Texto base |
| --- | --- | --- |
| Inscrição recebida | E-mail + WhatsApp | "Oi, {nome}! Recebemos sua inscrição na mentoria do Tech Woman. Acompanhe aqui: {link}" |
| Convite de horário | E-mail | "{mentora} quer te mentorar às {horario}, na {mesa}. Confirme até {prazo}: {link}" |
| Convite de horário (RN20; título e texto editáveis em A7, o resto fixo) | WhatsApp (List Message) | Título "Oi, {nome}!"; texto "{mentora} quer te mentorar às {horario}, na {mesa}. Você aceita? Responda até {prazo}.\nDetalhes: {link}"; rodapé "Se preferir, responda SIM ou NÃO"; botão "Responder"; opções "Aceito" e "Não posso" (descrição "Você conta o motivo na sua página") |
| Resposta ao convite: aceitou | WhatsApp | A mensagem de Confirmação normal |
| Resposta ao convite: não pode (texto fixo) | WhatsApp | "Tudo bem, {nome}! Para recusar, conte o motivo na sua página: {link}. Se for o horário, você continua na fila com prioridade." |
| Resposta ao convite: não está mais disponível (texto fixo) | WhatsApp | "Este convite não está mais disponível. Veja como está sua inscrição: {link}" |
| Resposta ao convite: não entendida (texto fixo) | WhatsApp | "Não entendi. Toque em Aceito ou Não posso, ou responda SIM ou NÃO." |
| Confirmação | E-mail + WhatsApp | "Combinado! {horario} na {mesa} com {mentora}. Chegue 5 minutos antes." |
| Lembrete (antes da mentoria, tempos e canais configurados em A7; padrão 15 min) | WhatsApp e/ou e-mail | "Faltam {minutos} minutos: sua mentoria com {mentora} começa às {horario} na {mesa}. Te esperamos!" |
| Primeiro lembrete pelo WhatsApp: confirmação de presença (RN18; título e texto editáveis em A7, o resto fixo) | WhatsApp (List Message) | Título "Oi, {nome}!"; texto "Sua mentoria com {mentora} começa às {horario} na {mesa}: faltam {minutos} minutos. Você confirma sua presença?"; rodapé "Se preferir, responda SIM ou NÃO"; botão "Responder"; opções "Sim, confirmo" e "Não poderei ir" (descrição "Você poderá escolher outro horário") |
| Resposta: confirmou (texto fixo) | WhatsApp | "Obrigada por confirmar, {nome}! Te esperamos às {horario} na {mesa}." |
| Resposta: não poderá ir (texto fixo) | WhatsApp | "Tudo bem, {nome}. Sua mentoria das {horario} foi cancelada e você continua na fila com prioridade. Se quiser, escolha um novo horário aqui: {link}" |
| Resposta: não entendida (texto fixo) | WhatsApp | "Não entendi. Responda SIM para confirmar ou NÃO para cancelar sua mentoria das {horario}." |
| Convite expirado | E-mail | "O prazo para confirmar terminou e o horário foi liberado. Sua inscrição continua ativa." |
| Cancelamento pela mentora | E-mail + WhatsApp | "Sua mentoria das {horario} foi cancelada. Você voltou para a fila com prioridade." |
| Inscrição cancelada pela participante (texto fixo) | E-mail + WhatsApp | "Tudo certo, {nome}. Sua inscrição na mentoria do Tech Woman foi cancelada, como você pediu. Se havia um horário marcado, ele foi liberado. Se mudar de ideia, é só se inscrever de novo: {link_inscricao}" |

## Pendências de UI

- [ ] Rafaela confirmar os campos da inscrição (P4): data de nascimento entra ou não?
- [ ] Lista oficial das \~50 mentoras com nome, e-mail, LinkedIn e horários, para o modelo de importação (A3).
- [ ] Lista de áreas finais da gamificação, para os selos e filtros (P3, P4, M4).
- [ ] Foto da mentora: obrigatória, opcional ou fora?
- [ ] Haverá avaliação pós-mentoria? Se sim, link na tela de status Concluída (P6).
- [ ] Texto do aviso de privacidade (LGPD) e quem é a controladora dos dados, sem citar o Bradesco.
- [ ] Fase 2, se der tempo: tela de configuração das perguntas e pesos da gamificação no admin (hoje ficam fixas no código).

