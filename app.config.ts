import type { ExpoConfig } from 'expo/config';

// ID do projeto no expo.dev (Projects > sarry > Project ID). Cole aqui ou defina EAS_PROJECT_ID.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '';

const config: ExpoConfig = {
  name: 'Sarry',
  slug: 'sarry',
  scheme: 'sarry',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0E1116',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.sarry.app',
    infoPlist: {
      NSFaceIDUsageDescription: 'O Sarry usa o Face ID para proteger o acesso à sua casa.',
    },
  },
  android: {
    package: 'com.sarry.app',
    adaptiveIcon: {
      backgroundColor: '#0E1116',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Arquivo do Firebase para push no Android (Fase 4). Opcional até lá.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
    bundler: 'metro',
    name: 'Sarry',
    themeColor: '#0E1116',
    backgroundColor: '#0E1116',
  },
  plugins: [
    ['expo-router', { asyncRoutes: { web: false } }],
    'expo-status-bar',
    'expo-font',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#0E1116' },
    ],
    'expo-secure-store',
    [
      'expo-local-authentication',
      { faceIDPermission: 'O Sarry usa o Face ID para proteger o acesso à sua casa.' },
    ],
    ['expo-notifications', { color: '#F2B544' }],
    './plugins/with-android-shortcuts',
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    eas: {
      ...(EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : {}),
    },
  },
};

export default config;
