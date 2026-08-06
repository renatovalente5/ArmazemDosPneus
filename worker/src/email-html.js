/* =============================================================
   ARMAZÉM DOS PNEUS — construtor de HTML para os emails transacionais
   -------------------------------------------------------------
   O HTML de email não é HTML de site. As regras abaixo não são preferências:
   são o que sobrevive ao Outlook clássico do Windows, ao Gmail (que ignora
   dark mode e limita o <style> a 16 KB) e ao Yahoo.

     · Tabelas com role="presentation", uma coluna de 600 px. Sem flex, sem
       grid, sem gap — nenhum funciona de forma fiável.
     · Espaçamento em padding de <td>, uma célula por linha onde o espaço
       importa: o Outlook aplica a TODA a linha o maior padding vertical de
       qualquer célula dela.
     · Tudo inline. O <style> do <head> é só melhoria: não funciona no Gmail
       mobile-webmail nem nas apps Gmail com contas IMAP.
     · Sem variáveis CSS (só o Apple Mail as suporta), sem background-image,
       sem rem. Todas as cores escritas por extenso.
     · O amarelo da marca é SEMPRE fundo, nunca cor de texto sobre claro:
       #FECB00 sobre branco dá 1,53:1 e é ilegível. Sobre #111111 dá 12,37:1.
     · Dark mode: o cabeçalho é um PNG OPACO. Os pixels de uma imagem não são
       invertidos por nenhum cliente, logo o logótipo nunca desaparece.
     · Nada de informação obrigatória dentro de imagens — o Outlook desktop
       bloqueia imagens por omissão.
   ============================================================= */

/* Cores literais: não há var() em email. */
const PRETO = '#111111';
const AMARELO = '#FECB00';
const TEXTO = '#222222';
const TEXTO2 = '#555555';
const LINHA = '#e6e6e6';
const LINK = '#8a6d00';      /* 4,92:1 sobre branco — o amarelo da marca não serve para texto */
const RODAPE = '#6f6f6f';    /* #777777 falha AA por 0,02 */

const FONTE_T = "'Oswald','Arial Narrow',Arial,sans-serif";
const FONTE_C = "'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + '&nbsp;€';

/* ---------- blocos ---------- */

/** Título de secção. <h2> real: funciona em todos os clientes. */
export function h2(txt) {
  return `<h2 class="h t" style="margin:0 0 8px 0;font-family:${FONTE_T};font-size:16px;line-height:22px;font-weight:600;color:${PRETO};text-transform:uppercase;mso-line-height-rule:exactly;">${esc(txt)}</h2>`;
}

export function p(html, extra) {
  return `<p style="margin:0 0 ${extra === 'last' ? '0' : '16px'} 0;">${html}</p>`;
}

export function link(url, txt) {
  return `<a href="${esc(url)}" style="color:${LINK};text-decoration:underline;">${esc(txt || url)}</a>`;
}

/** Bloco de texto normal, dentro de uma célula própria. */
export function bloco(htmlInterior, padding) {
  return `<tr><td class="p t2" style="padding:${padding || '24px 40px'};font-family:${FONTE_C};font-size:14px;line-height:22px;color:${TEXTO2};mso-line-height-rule:exactly;">${htmlInterior}</td></tr>`;
}

/** Tabela de artigos + totais. Uma linha por artigo (bug de padding do Outlook). */
export function tabelaArtigos(order) {
  const linhas = order.lines.map((l) => `
        <tr>
          <td class="t" style="padding:10px 0;border-bottom:1px solid ${LINHA};font-family:${FONTE_C};font-size:15px;line-height:22px;color:${TEXTO};">${esc(l.qty)}× ${esc(l.name)}</td>
          <td align="right" class="t" style="padding:10px 0;border-bottom:1px solid ${LINHA};font-family:${FONTE_C};font-size:15px;line-height:22px;color:${TEXTO};white-space:nowrap;">${eur(l.unit_cents * l.qty)}</td>
        </tr>`).join('');

  const menor = (rot, val) => `
        <tr>
          <td class="t2" style="padding:6px 0;font-family:${FONTE_C};font-size:14px;line-height:20px;color:${TEXTO2};">${esc(rot)}</td>
          <td align="right" class="t2" style="padding:6px 0;font-family:${FONTE_C};font-size:14px;line-height:20px;color:${TEXTO2};white-space:nowrap;">${val}</td>
        </tr>`;

  const pago = order.amount_mismatch ? order.amount_mismatch.cobrado : order.total_cents;

  return `<tr><td class="p" style="padding:8px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${linhas}
        ${menor('Subtotal', eur(order.subtotal_cents))}
        ${menor(order.entrega === 'ctt' ? `Portes (${esc(order.weight_kg)} kg)` : 'Entrega', order.shipping_cents ? eur(order.shipping_cents) : 'Grátis')}
        <tr>
          <td class="t" style="padding:12px 0 0 0;border-top:2px solid ${PRETO};font-family:${FONTE_T};font-size:18px;line-height:24px;font-weight:600;color:${PRETO};text-transform:uppercase;">Total pago</td>
          <td align="right" class="t" style="padding:12px 0 0 0;border-top:2px solid ${PRETO};font-family:${FONTE_T};font-size:18px;line-height:24px;font-weight:600;color:${PRETO};white-space:nowrap;">${eur(pago)}</td>
        </tr>
        <tr><td colspan="2" class="t2" style="padding:2px 0 0 0;font-family:${FONTE_C};font-size:12px;line-height:18px;color:${TEXTO2};">IVA 23% e ecovalor incluídos.</td></tr>
      </table>
    </td></tr>`;
}

/**
 * Caixa da referência Multibanco. Texto VIVO e monoespaçado, nunca imagem: o
 * cliente tem de poder copiar, e o Outlook bloqueia imagens por omissão.
 * white-space:nowrap para a referência não quebrar a meio.
 */
export function caixaMultibanco(mb, totalCents) {
  const campo = (rot, val, grande) => `
          <p style="margin:0 0 4px 0;font-family:${FONTE_C};font-size:12px;line-height:16px;color:${AMARELO};text-transform:uppercase;letter-spacing:1px;">${esc(rot)}</p>
          <p class="${grande ? 'mb' : ''}" style="margin:0 0 ${grande ? '16' : '12'}px 0;font-family:'Courier New',Courier,monospace;font-size:${grande ? '30' : '20'}px;line-height:${grande ? '36' : '26'}px;font-weight:bold;color:#ffffff;letter-spacing:${grande ? '3' : '1'}px;white-space:nowrap;mso-line-height-rule:exactly;">${esc(val)}</p>`;

  const validade = mb.expires_at ? new Date(mb.expires_at * 1000).toLocaleDateString('pt-PT') : null;
  return `<tr><td class="p" style="padding:8px 40px 24px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PRETO}" style="background-color:${PRETO};">
        <tr><td align="center" style="padding:24px 24px 12px 24px;">
          ${campo('Entidade', mb.entity, true)}
          ${campo('Referência', mb.reference, true)}
          ${campo('Valor', (totalCents / 100).toFixed(2).replace('.', ',') + ' EUR')}
          ${validade ? campo('Válida até', validade) : ''}
        </td></tr>
      </table>
    </td></tr>`;
}

/**
 * Botão. VML para o Outlook clássico, tabela para os restantes.
 * #111111 sobre #FECB00 = 12,37:1. padding 15px + line-height 20px = 50px de
 * altura, acima dos 44px da SC 2.5.5 (AAA).
 */
export function botao(url, txt) {
  return `<tr><td align="center" class="p" style="padding:8px 40px 28px 40px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="12%" strokecolor="${AMARELO}" fillcolor="${AMARELO}">
        <w:anchorlock/><center style="color:${PRETO};font-family:'Arial Narrow',Arial,sans-serif;font-size:17px;font-weight:bold;">${esc(txt).toUpperCase()}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="${AMARELO}" style="background-color:${AMARELO};border-radius:6px;">
          <a href="${esc(url)}" style="display:block;min-width:200px;padding:15px 32px;font-family:${FONTE_T};font-size:17px;line-height:20px;font-weight:600;color:${PRETO};text-decoration:none;text-transform:uppercase;letter-spacing:.5px;border-radius:6px;">${esc(txt)}</a>
        </td></tr>
      </table>
      <!--<![endif]-->
    </td></tr>`;
}

export function separador() {
  return `<tr><td class="p" style="padding:0 40px;"><div class="hr" style="border-top:1px solid ${LINHA};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
}

/**
 * Envolve os blocos no documento completo.
 * @param titulo    <h1> do email
 * @param subtitulo linha sob o título (nº de encomenda e data)
 * @param preheader texto da lista de mensagens. ATENÇÃO: no Gmail
 *                  mobile-webmail o display:none não funciona e este texto
 *                  aparece como primeira linha — tem de ser escrito para ser lido.
 */
export function documento({ assunto, preheader, titulo, subtitulo, corpo, siteUrl }) {
  const base = (siteUrl || 'https://armazemdospneus.pt').replace(/\/+$/, '');
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="pt-PT" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<!-- Sem isto, o Apple Mail transforma a referência, a data e o telefone em
     links azuis sublinhados e destrói a legibilidade no iPhone. -->
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<title>${esc(assunto)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,a{font-family:Arial,sans-serif !important;}h1,h2,.h{font-family:'Arial Narrow',Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  /* APENAS MELHORIA. Não funciona no Gmail mobile-webmail nem nas apps Gmail
     com contas IMAP. Tudo o que é essencial está inline. */
  html,body{margin:0 !important;padding:0 !important;width:100% !important;}
  body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;display:block;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
  .ii a[href]{color:inherit !important;}
  @media only screen and (max-width:620px){
    .w{width:100% !important;}
    .p{padding-left:20px !important;padding-right:20px !important;}
    .h1{font-size:26px !important;line-height:32px !important;}
    .mb{font-size:26px !important;letter-spacing:2px !important;}
  }
  /* Dark mode 1 — Apple Mail, Outlook macOS/.com/iOS/Android. */
  @media (prefers-color-scheme:dark){
    .bg:not([class^="x_"]){background-color:#0d0d0d !important;}
    .card:not([class^="x_"]){background-color:#161616 !important;}
    .t:not([class^="x_"]),.t:not([class^="x_"]) *{color:#f4f4f4 !important;}
    .t2:not([class^="x_"]),.t2:not([class^="x_"]) *{color:#b8b8b8 !important;}
    .hr:not([class^="x_"]){border-color:#2e2e2e !important;}
  }
  /* Dark mode 2 — o Outlook.com injeta data-ogsb/data-ogsc ao reescrever cores. */
  [data-ogsb] .bg{background-color:#0d0d0d !important;}
  [data-ogsb] .card{background-color:#161616 !important;}
  [data-ogsc] .t,[data-ogsc] .t *{color:#f4f4f4 !important;}
  [data-ogsc] .t2,[data-ogsc] .t2 *{color:#b8b8b8 !important;}
  /* O Gmail e o Yahoo ignoram os dois caminhos. Por isso o modo claro já é à
     prova de inversão: cabeçalho em imagem opaca e preto sobre branco. */
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#f2f2f2;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background-color:#f2f2f2;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w card" style="width:600px;max-width:600px;background-color:#ffffff;">
    <!-- PNG OPACO: os pixels não são invertidos, logo o logótipo nunca
         desaparece em dark mode. Servido a 2x, sem SVG, sem base64, sem WebP. -->
    <tr><td align="center" bgcolor="#000000" style="background-color:#000000;padding:0;">
      <img src="${base}/assets/email/header-600x140.png" width="600" height="140" alt="Armazém dos Pneus" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
    </td></tr>
    <tr><td bgcolor="${AMARELO}" style="background-color:${AMARELO};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td class="p" style="padding:32px 40px 4px 40px;">
      <h1 class="h1 h t" style="margin:0 0 6px 0;font-family:${FONTE_T};font-size:30px;line-height:36px;font-weight:600;color:${PRETO};text-transform:uppercase;letter-spacing:.5px;mso-line-height-rule:exactly;">${esc(titulo)}</h1>
      <p class="t2" style="margin:0;font-family:${FONTE_C};font-size:15px;line-height:22px;color:${TEXTO2};mso-line-height-rule:exactly;">${esc(subtitulo)}</p>
    </td></tr>
${corpo}
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="w" style="width:600px;max-width:600px;">
    <tr><td align="center" class="t2" style="padding:20px 24px;font-family:${FONTE_C};font-size:12px;line-height:18px;color:${RODAPE};">
      Recebeu este email porque fez uma encomenda em armazemdospneus.pt. É um email transacional.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
