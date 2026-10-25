// Atalhos estáticos no ícone do app (Android): toque e segure o ícone do Sarry.
// Cada atalho abre o deep link sarry://atalho/<acao>, tratado pela rota src/app/atalho/[acao].tsx.
// Não precisa de módulo nativo extra; entra no APK gerado pelo EAS (não funciona no Expo Go).
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const SHORTCUTS = [
  { id: 'dormir', label: 'Dormir', icon: 'ic_shortcut_dormir' },
  { id: 'sair', label: 'Sair', icon: 'ic_shortcut_sair' },
  { id: 'desligar_ar', label: 'Desligar o ar', icon: 'ic_shortcut_ar' },
];

// Ícones em traço (vetor), no estilo lucide
const ICONS = {
  ic_shortcut_dormir: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  ic_shortcut_sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  ic_shortcut_ar: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04',
};

function vector(pathData) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:pathData="${pathData}" android:strokeColor="#F2B544" android:strokeWidth="2"
      android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>
</vector>
`;
}

function shortcutsXml(pkg, scheme) {
  const items = SHORTCUTS.map(
    (s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true"
      android:icon="@drawable/${s.icon}"
      android:shortcutShortLabel="@string/shortcut_${s.id}">
    <intent android:action="android.intent.action.VIEW"
        android:targetPackage="${pkg}"
        android:targetClass="${pkg}.MainActivity"
        android:data="${scheme}://atalho/${s.id}" />
  </shortcut>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
`;
}

module.exports = function withAndroidShortcuts(config) {
  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['meta-data'] = (activity['meta-data'] ?? []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    activity['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      const scheme = Array.isArray(cfg.scheme) ? cfg.scheme[0] : cfg.scheme;
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
      fs.writeFileSync(path.join(res, 'xml/shortcuts.xml'), shortcutsXml(pkg, scheme));
      for (const [name, d] of Object.entries(ICONS)) fs.writeFileSync(path.join(res, `drawable/${name}.xml`), vector(d));

      // textos dos atalhos em values/strings.xml
      const stringsPath = path.join(res, 'values/strings.xml');
      let xml = fs.readFileSync(stringsPath, 'utf8');
      for (const s of SHORTCUTS) {
        const line = `<string name="shortcut_${s.id}">${s.label}</string>`;
        if (!xml.includes(`name="shortcut_${s.id}"`)) xml = xml.replace('</resources>', `  ${line}\n</resources>`);
      }
      fs.writeFileSync(stringsPath, xml);
      return cfg;
    },
  ]);
};
