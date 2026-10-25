// Pós-build da web: converte o pacote para ES5 e adiciona polyfills, para abrir em
// navegadores antigos (ex.: iPad com iOS 10, usado como painel de parede).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
      // detecta gap em flexbox; sem suporte, o global.css troca por margens
      'document.addEventListener("DOMContentLoaded", function () {',
      '  var f = document.createElement("div"); f.style.display = "flex"; f.style.flexDirection = "column"; f.style.rowGap = "1px";',
      '  f.appendChild(document.createElement("div")); f.appendChild(document.createElement("div"));',
      '  document.body.appendChild(f); var ok = f.scrollHeight === 1; document.body.removeChild(f);',
      '  if (!ok) document.documentElement.className += " no-flexgap";',
      '});',
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

for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
  const path = join(JS_DIR, file);
  const { code } = await transformAsync(readFileSync(path, 'utf8'), {
    babelrc: false,
    configFile: false,
    compact: true,
    sourceType: 'script',
    presets: [['@babel/preset-env', { targets: TARGETS, modules: false }]],
  });
  writeFileSync(path, code);
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

writeFileSync(join(JS_DIR, 'polyfills.js'), polyfillCode);
for (const html of readdirSync(DIST).filter((f) => f.endsWith('.html'))) {
  const path = join(DIST, html);
  const src = readFileSync(path, 'utf8');
  if (src.includes('polyfills.js')) continue;
  // o polyfill roda antes do app (script normal, sem defer)
  writeFileSync(
    path,
    src
      .replace('</head>', `<style>${gapCss}</style></head>`)
      .replace('<script src="/_expo/', '<script src="/_expo/static/js/web/polyfills.js"></script><script src="/_expo/'),
  );
}
console.log('Polyfills adicionados');
