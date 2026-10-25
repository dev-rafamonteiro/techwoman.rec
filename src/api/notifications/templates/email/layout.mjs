// Layout compartilhado (tabelas, largura máxima 600 px). O CSS fica em CSS_BLOCK
// com classes; o build o aplica inline com juice. Estilos específicos do e-mail
// (cores do selo) já saem inline daqui.

const FONT_BODY = "'Manrope', Arial, Helvetica, sans-serif";
const FONT_DISPLAY = "'Unbounded', 'Arial Black', Arial, sans-serif";

export const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&family=Manrope:wght@400;500;600;700;800&display=swap';

export const CSS_BLOCK = `
body { margin: 0; padding: 0; background-color: #F3DDF6; }
table { border-collapse: separate; border-spacing: 0; }
td { padding: 0; }
.canvas { background-color: #F3DDF6; }
.wrap { width: 100%; max-width: 600px; background-color: #FFFFFF; border-radius: 20px; box-shadow: 0 10px 30px rgba(61,10,69,0.12); }
.hero { background-color: #6E1A78; background-image: linear-gradient(180deg, #6E1A78 0%, #B85BC4 100%); padding: 28px 32px 26px; border-radius: 20px 20px 0 0; }
.shape { width: 28px; height: 28px; font-size: 1px; line-height: 1px; }
.shape-1 { background-color: #F26430; border-radius: 50%; }
.shape-2 { background-color: #C9F4EE; border-radius: 8px; }
.shape-3 { background-color: #D98CE6; border-radius: 14px 14px 0 0; }
.gap8 { width: 8px; font-size: 1px; line-height: 1px; }
.hero-sub { padding-top: 14px; font-family: ${FONT_BODY}; font-size: 13px; line-height: 1.4; font-weight: 700; color: #FBEAFD; }
.body { padding: 28px 32px 0; font-family: ${FONT_BODY}; color: #3D0A45; }
.selo { font-family: ${FONT_BODY}; font-size: 12px; line-height: 1.3; font-weight: 800; letter-spacing: 1px; padding: 6px 12px; border-radius: 999px; }
.h2 { margin: 14px 0 0; font-family: ${FONT_DISPLAY}; font-size: 28px; font-weight: 800; line-height: 1.2; color: #3D0A45; }
.p { margin: 14px 0 0; font-family: ${FONT_BODY}; font-size: 16px; line-height: 1.6; color: #3D0A45; }
.p-next { margin-top: 26px; }
.card-wrap { padding: 18px 32px 0; }
.card { width: 100%; background-color: #3D0A45; border-radius: 14px; }
.card-cell { padding: 14px 16px; vertical-align: top; }
.card-sep { border-left: 1px solid #5B1466; }
.card-k { font-family: ${FONT_BODY}; font-size: 11px; line-height: 1.4; font-weight: 700; letter-spacing: 1px; color: #D98CE6; }
.card-v { font-family: ${FONT_DISPLAY}; font-size: 20px; font-weight: 800; line-height: 1.25; color: #C9F4EE; word-break: break-word; overflow-wrap: anywhere; }
.destaque-wrap { padding: 16px 32px 0; }
.destaque { width: 100%; background-color: #FFE1D3; border-radius: 12px; }
.destaque-td { padding: 12px 16px; font-family: ${FONT_BODY}; font-size: 15px; line-height: 1.4; font-weight: 700; color: #8A3210; }
.cta-wrap { padding: 26px 32px 0; text-align: center; }
.btn { background-color: #F26430; border-radius: 999px; }
.btn-a { display: inline-block; padding: 15px 30px; font-family: ${FONT_BODY}; font-size: 16px; line-height: 1.2; font-weight: 800; color: #3D0A45; text-decoration: none; }
.btn-sec { border: 2px solid #EBCFF0; border-radius: 999px; }
.btn-sec-a { display: inline-block; padding: 13px 28px; font-family: ${FONT_BODY}; font-size: 16px; line-height: 1.2; font-weight: 800; color: #8A1F96; text-decoration: none; }
.nota { padding: 20px 32px 0; font-family: ${FONT_BODY}; font-size: 14px; line-height: 1.5; color: #5E3A66; }
.fallback { padding: 18px 32px 28px; font-family: ${FONT_BODY}; font-size: 13px; line-height: 1.5; color: #5E3A66; }
.fallback a { color: #8A1F96; text-decoration: underline; word-break: break-all; }
.footer { background-color: #3D0A45; padding: 22px 32px; border-radius: 0 0 20px 20px; font-family: ${FONT_BODY}; font-size: 12px; line-height: 1.6; color: #F1D9F5; }
.footer strong { color: #FFFFFF; }
.footer a { color: #C9F4EE; text-decoration: underline; }
.preheader { display: none; max-height: 0; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: #F3DDF6; mso-hide: all; }
@media only screen and (max-width: 620px) {
  .hero, .body, .footer { padding-left: 20px !important; padding-right: 20px !important; }
  .card-wrap, .destaque-wrap, .cta-wrap, .nota, .fallback { padding-left: 20px !important; padding-right: 20px !important; }
  .h2 { font-size: 24px !important; }
  .card-v { font-size: 17px !important; }
}
`;

// placeholders {{x}} passam intactos; o worker faz o escape.
// [texto]({{var}}) vira link (só no HTML; o .txt mostra "texto (url)").
const t = (s) => s.replace(/\[([^\]]+)\]\((\{\{[a-z_]+\}\})\)/g, '<a href="$2" style="color:#8A1F96;font-weight:700;text-decoration:underline">$1</a>');
const plain = (s) => s.replace(/\[([^\]]+)\]\((\{\{[a-z_]+\}\})\)/g, '$1 ($2)');

function card(items) {
  const w = Math.floor(100 / items.length);
  const cells = items
    .map(
      ([k, v], i) =>
        `<td class="card-cell${i ? ' card-sep' : ''}" width="${w}%" valign="top"><div class="card-k">${t(k)}</div><div class="card-v">${t(v)}</div></td>`,
    )
    .join('');
  return `<tr><td class="card-wrap"><table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#3D0A45"><tr>${cells}</tr></table></td></tr>`;
}

export function renderHtml(e) {
  const [selo, seloBg, seloFg] = e.selo;
  const paras = e.paragrafos
    .map((p, i) => `<p class="p${i ? ' p-next' : ''}">${t(p)}</p>`)
    .join('');
  const sec = e.sec
    ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px"><tr><td class="btn-sec"><a class="btn-sec-a" href="{{${e.sec[1]}}}">${e.sec[0]}</a></td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Tech Woman</title>
<link rel="stylesheet" href="${FONTS_URL}">
<style>${CSS_BLOCK}</style>
</head>
<body class="canvas" bgcolor="#F3DDF6">
<div class="preheader">${t(e.preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3DDF6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" align="center">
<tr><td class="hero" bgcolor="#6E1A78">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="middle"><img src="https://techwoman.dev/brand/techwoman-logo-600.png" width="180" height="64" alt="Tech Woman" style="display:block;border:0;outline:none;text-decoration:none;height:64px;width:180px;color:#FFFFFF;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;"></td>
<td align="right" valign="middle" aria-hidden="true"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td class="shape shape-1" width="28" height="28" bgcolor="#F26430">&nbsp;</td><td class="gap8" width="8">&nbsp;</td><td class="shape shape-2" width="28" height="28" bgcolor="#C9F4EE">&nbsp;</td><td class="gap8" width="8">&nbsp;</td><td class="shape shape-3" width="28" height="28" bgcolor="#D98CE6">&nbsp;</td></tr></table></td>
</tr>
<tr><td colspan="2" class="hero-sub">Mentoria · {{evento_data}} · {{evento_local}}</td></tr>
</table>
</td></tr>
<tr><td class="body">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="selo" bgcolor="${seloBg}" style="background-color:${seloBg};color:${seloFg}">${e.selo[0]}</td></tr></table>
<h2 class="h2">${t(e.titulo)}</h2>
${paras}
</td></tr>
${e.card ? card(e.card) : ''}
${e.destaque ? `<tr><td class="destaque-wrap"><table role="presentation" class="destaque" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFE1D3"><tr><td class="destaque-td">${t(e.destaque)}</td></tr></table></td></tr>` : ''}
<tr><td class="cta-wrap" align="center">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td class="btn" bgcolor="#F26430"><a class="btn-a" href="{{${e.botao[1]}}}">${e.botao[0]}</a></td></tr></table>
${sec}
</td></tr>
${e.nota ? `<tr><td class="nota">${t(e.nota)}</td></tr>` : ''}
<tr><td class="fallback">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="{{${e.linkFallback}}}">{{${e.linkFallback}}}</a></td></tr>
<tr><td class="footer" bgcolor="#3D0A45"><strong>{{evento_nome}}</strong> · {{evento_data}} · {{evento_local}}<br>
Você recebeu este e-mail porque se inscreveu na mentoria do evento. Este endereço não recebe respostas.<br>
<a href="{{link_privacidade}}">Aviso de privacidade</a></td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}

export function renderText(e) {
  const lines = [];
  lines.push('TECH WOMAN', 'Mentoria · {{evento_data}} · {{evento_local}}', '', `[${e.selo[0]}]`, '', e.titulo, '');
  for (const p of e.paragrafos) lines.push(plain(p), '');
  if (e.card) {
    for (const [k, v] of e.card) lines.push(`${k}: ${v}`);
    lines.push('');
  }
  if (e.destaque) lines.push(e.destaque, '');
  lines.push(`${e.botao[0]}: {{${e.botao[1]}}}`);
  if (e.sec) lines.push(`${e.sec[0]}: {{${e.sec[1]}}}`);
  lines.push('');
  if (e.nota) lines.push(e.nota, '');
  lines.push(
    'Se o botão não funcionar, copie e cole este link no navegador:',
    `{{${e.linkFallback}}}`,
    '',
    '--',
    '{{evento_nome}} · {{evento_data}} · {{evento_local}}',
    'Você recebeu este e-mail porque se inscreveu na mentoria do evento. Este endereço não recebe respostas.',
    'Aviso de privacidade: {{link_privacidade}}',
    '',
  );
  return lines.join('\n');
}
