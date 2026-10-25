// Pós-build da web: gera uma segunda versão do pacote em ES5, com polyfills, para navegadores
// antigos (ex.: iPad com iOS 10, usado como painel de parede). Navegadores atuais continuam
// recebendo o pacote moderno, mais leve; um carregador no index.html escolhe qual baixar.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformAsync } from '@babel/core';
import { build } from 'esbuild';

const DIST = 'dist';
const JS_DIR = join(DIST, '_expo/static/js/web');
// alvo ES5 completo: o Safari 10 tem bugs conhecidos com let/const e classes
const TARGETS = { ie: '11' };

const polyfills = await build({
  stdin: {
    contents: [
      "import 'core-js/stable';",
      "import 'regenerator-runtime/runtime';",
      "import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';",
      "import 'fast-text-encoding';",
      "import ResizeObserver from 'resize-observer-polyfill';",
      'if (!window.ResizeObserver) window.ResizeObserver = ResizeObserver;',
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
});
const polyfillCode = (
  await transformAsync(polyfills.outputFiles[0].text, {
    babelrc: false,
    configFile: false,
    compact: true,
    sourceType: 'script',
    presets: [['@babel/preset-env', { targets: TARGETS, modules: false }]],
  })
).code;

const entries = readdirSync(JS_DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.legacy.js') && f !== 'polyfills.js');
for (const file of entries) {
  const path = join(JS_DIR, file);
  const { code } = await transformAsync(readFileSync(path, 'utf8'), {
    babelrc: false,
    configFile: false,
    compact: true,
    sourceType: 'script',
    presets: [['@babel/preset-env', { targets: TARGETS, modules: false }]],
  });
  writeFileSync(path.replace(/\.js$/, '.legacy.js'), code);
  console.log(`ES5: ${file}`);
}

// Navegadores sem gap em flexbox (Safari < 14.1): espaçamento por margem, só com a classe no-flexgap
const GAPS = { '1': 4, '1\\.5': 6, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24 };
const gapCss = Object.entries(GAPS)
  .map(
    ([k, px]) =>
      `.no-flexgap .gap-${k}:not(.flex-row)>*+*{margin-top:${px}px}.no-flexgap .gap-${k}.flex-row>*+*{margin-left:${px}px}`,
  )
  .join('');

// Mostra na tela qualquer erro de carregamento (aparelhos antigos não têm console à mão)
const errorOverlay = `<script>(function(){function show(m){if(!window.__sarryLegacy)return;var d=document.getElementById('sarry-erro');if(!d){d=document.createElement('pre');d.id='sarry-erro';d.style.cssText='position:fixed;left:0;right:0;bottom:0;max-height:50%;overflow:auto;margin:0;padding:12px;background:#300;color:#fff;font:12px monospace;z-index:99999;white-space:pre-wrap';(document.body||document.documentElement).appendChild(d);}d.textContent+=m+'\\n';}window.onerror=function(msg,src,line,col,err){show('Erro: '+msg+' ('+(src||'').split('/').pop()+':'+line+':'+col+')'+(err&&err.stack?'\\n'+err.stack:''));};window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('Promise: '+(r&&(r.stack||r.message)||r));});})();</script>`;

writeFileSync(join(JS_DIR, 'polyfills.js'), polyfillCode);

// "Adicionar à Tela de Início" no iPhone/iPad: abre em tela cheia, com ícone próprio
copyFileSync('assets/icon.png', join(DIST, 'apple-touch-icon.png'));
const homeScreenMeta = [
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
  '<meta name="apple-mobile-web-app-title" content="Sarry">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
].join('');

// Cores no formato "rgb(R G B / A)" só funcionam a partir do Safari 12.1; vira rgba(R, G, B, A)
const CSS_DIR = join(DIST, '_expo/static/css');
const MODERN_RGB = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*(var\([^()]*\)|[\d.]+%?)\s*)?\)/g;
for (const file of readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))) {
  const path = join(CSS_DIR, file);
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(MODERN_RGB, (_, r, g, b, a) => (a ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`)),
  );
}
// Ajustes pequenos que valem para todos (Safari 11 a 15 também não têm alguns destes) e o
// carregador: navegador com suporte a módulos ES recebe o pacote moderno; os demais, o legado.
const shims = [
  'var c=window.crypto||window.msCrypto;',
  'if(c&&c.getRandomValues&&!c.randomUUID)c.randomUUID=function(){var b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=[];for(var i=0;i<16;i++)h.push((b[i]+256).toString(16).slice(1));return h.slice(0,4).join("")+"-"+h.slice(4,6).join("")+"-"+h.slice(6,8).join("")+"-"+h.slice(8,10).join("")+"-"+h.slice(10).join("")};',
  'var mq=window.matchMedia&&window.matchMedia("all");',
  'if(mq&&!mq.addEventListener&&window.MediaQueryList){MediaQueryList.prototype.addEventListener=function(t,f){this.addListener(f)};MediaQueryList.prototype.removeEventListener=function(t,f){this.removeListener(f)}}',
].join('');
const loader = (entry) =>
  `<script>(function(){${shims}var legacy=!('noModule' in document.createElement('script'));window.__sarryLegacy=legacy;` +
  `var base='/_expo/static/js/web/';var srcs=legacy?[base+'polyfills.js',base+'${entry.replace(/\.js$/, '.legacy.js')}']:[base+'${entry}'];` +
  `document.addEventListener('DOMContentLoaded',function(){` +
  // detecta gap em flexbox; sem suporte, o CSS acima troca por margens
  `var f=document.createElement('div');f.style.display='flex';f.style.flexDirection='column';f.style.rowGap='1px';f.appendChild(document.createElement('div'));f.appendChild(document.createElement('div'));document.body.appendChild(f);if(f.scrollHeight!==1)document.documentElement.className+=' no-flexgap';document.body.removeChild(f);` +
  `for(var i=0;i<srcs.length;i++){var e=document.createElement('script');e.src=srcs[i];e.async=false;document.body.appendChild(e);}});})();</script>`;

for (const html of readdirSync(DIST).filter((f) => f.endsWith('.html'))) {
  const path = join(DIST, html);
  const src = readFileSync(path, 'utf8');
  if (src.includes('__sarryLegacy=')) continue;
  const entryTag = src.match(/<script src="\/_expo\/static\/js\/web\/([^"]+\.js)" defer><\/script>/);
  if (!entryTag) throw new Error(`Script do app não encontrado em ${html}`);
  writeFileSync(
    path,
    src
      .replace('<head>', `<head>${errorOverlay}${homeScreenMeta}`)
      .replace('</head>', `<style>${gapCss}</style></head>`)
      .replace(entryTag[0], loader(entryTag[1])),
  );
}
console.log('Versão legada e carregador adicionados');
