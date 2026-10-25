# Sarry

App para controlar a casa inteligente (dispositivos Nova Digital / Tuya) no Android, iOS e web, a partir de um único código.

- **App**: Expo SDK 58 (React Native) + TypeScript + Expo Router + NativeWind, tema escuro, fontes Sora e Manrope.
- **Backend**: Supabase (login, Postgres com RLS, Edge Functions e pg_cron). Só as Edge Functions falam com a Tuya Cloud OpenAPI.
- **Publicação**: APK pelo EAS Build e web exportada com `expo export` na Vercel.

**Comece por [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md)**: passo a passo de Tuya, Supabase, Expo/EAS e Vercel, com testes por fase.

## Estrutura

```text
src/app/              rotas (Expo Router): abas Início, Cenas, Uso, Ajustes; ar/[id], painel, diagnóstico, atalhos
src/components/       Card, Toggle, Dial, BarChart, LightTile, AcCard...
src/features/         sessão, dispositivos, clima (data points do ar), cenas, uso, ajustes
src/lib/              cliente Supabase, API da Edge Function, armazenamento seguro, push, biometria
supabase/migrations/  tabelas, RLS, funções SQL e agendamentos do pg_cron
supabase/functions/   tuya (API do app), snapshot (histórico e alertas), _shared (cliente Tuya)
plugins/              atalhos no ícone do Android
.github/workflows/    verificação, publicação do Supabase e build do APK
```

## Comandos

```bash
npm install
npm start            # Expo (Expo Go no celular, "w" para web)
npm run typecheck
npm run build:web    # gera dist/ para a Vercel
```

## Segurança

- Todas as Edge Functions exigem usuário autenticado e cadastrado em `members`; o snapshot exige `CRON_SECRET`.
- Segredos da Tuya só nos Secrets do Supabase. `.env.example` lista apenas as variáveis públicas.
- RLS ativado em todas as tabelas; sessão no `expo-secure-store` no celular; biometria opcional.
