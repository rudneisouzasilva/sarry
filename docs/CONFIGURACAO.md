# Sarry: configuração e testes

Este guia leva o Sarry do zero até o celular e a web. Siga as fases em ordem: cada uma termina com um teste.
Tudo roda em planos gratuitos (Tuya trial, Supabase Free, Expo/EAS Free, Vercel Hobby, GitHub Actions).

Você não precisa de computador ligado o tempo todo. Dá para fazer quase tudo pelo navegador:
o GitHub Actions publica o Supabase e gera o APK, e a Vercel publica a web sozinha a cada push.
O único passo que exige um computador (por alguns minutos) é testar no **Expo Go**, que é opcional.

---

## Fase 1: Tuya, Supabase e diagnóstico

### 1.1 Tuya (platform.tuya.com)

1. Crie uma conta em <https://platform.tuya.com> e entre.
2. **Cloud > Development > Create Cloud Project**:
   - Industry: *Smart Home*; Development Method: *Smart Home*.
   - Data Center: **Western America** (contas do Brasil normalmente ficam aqui).
3. Na tela de serviços de API, confirme que estes estão assinados (aba **Service API** do projeto):
   - *IoT Core*
   - *Authorization Token Management*
   - *Smart Home Scene Linkage* (cenas e automações)
4. **Devices > Link App Account > Add App Account**: aparece um QR code. No app do celular
   (*Eu/Me* > ícone de leitura no canto superior), escaneie e confirme. Escolha permissão *Controllable*.
   - O QR funciona com os apps **Smart Life** e **Tuya Smart**. Se o app Nova Digital não aceitar o QR
     (alguns apps de marca própria não aceitam), instale o Smart Life, entre com uma conta nova e
     pareie os aparelhos de novo nele. O Sarry passa a controlar tudo pela conta do Smart Life.
5. Anote:
   - **Access ID** e **Access Secret**: aba *Overview* do projeto.
   - **UID**: aba *Devices > Link App Account*, coluna *UID* da conta vinculada.
6. Na aba *Devices > All Devices*, os 6 aparelhos (hub, 3 interruptores Zigbee, 2 Wi-Fi e o ar) devem aparecer.

> O plano trial da Tuya tem cota mensal de chamadas e precisa ser renovado de tempos em tempos
> (o painel avisa por e-mail). O Sarry só consulta a Tuya ao abrir o app, ao voltar para ele,
> depois de um comando e a cada 10 minutos (snapshot): cerca de 5 mil chamadas por mês.

### 1.2 Supabase (supabase.com)

1. Crie um projeto gratuito. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Em **Project Settings > API Keys**, anote a **Project URL**, a chave **publishable** (ou *anon*)
   e, em **Project Settings > General**, o **Reference ID** do projeto.
3. **Segredos das Edge Functions** (*Edge Functions > Secrets > Add new secret*):

   | Nome | Valor |
   | --- | --- |
   | `TUYA_ACCESS_ID` | Access ID da Tuya |
   | `TUYA_ACCESS_SECRET` | Access Secret da Tuya |
   | `TUYA_BASE_URL` | `https://openapi.tuyaus.com` (Western America) |
   | `TUYA_UID` | UID da conta vinculada |
   | `CRON_SECRET` | um texto aleatório longo (ex.: gere em <https://www.uuidgenerator.net>) |

4. **Publicar banco e funções pelo GitHub** (recomendado, sem computador):
   - No GitHub: *Settings > Secrets and variables > Actions > New repository secret*:
     - `SUPABASE_ACCESS_TOKEN`: crie em supabase.com > ícone da conta > *Access Tokens*.
     - `SUPABASE_PROJECT_ID`: o Reference ID.
     - `SUPABASE_DB_PASSWORD`: a senha do banco.
   - Em *Actions > Publicar Supabase > Run workflow*. Ele aplica `supabase/migrations` e publica as
     funções `tuya` e `snapshot`. Depois disso, roda sozinho a cada mudança em `supabase/` na `main`.

   **Alternativa com computador**: `npx supabase login`, `npx supabase link --project-ref <ref>`,
   `npx supabase db push` e `npx supabase functions deploy tuya snapshot`.

   **Alternativa só pelo painel**: cole o conteúdo de `supabase/migrations/20261025000000_inicial.sql`
   no *SQL Editor* e rode. (Se depois usar o GitHub Action, rode antes
   `npx supabase migration repair --status applied 20261025000000` para ele não aplicar de novo.)

5. **Sua conta**: *Authentication > Users > Add user > Create new user* com seu e-mail e senha
   (marque *Auto Confirm User*). Depois, desligue o cadastro público em
   *Authentication > Sign In / Providers > Allow new users to sign up*.
6. **Libere sua conta como moradora** no *SQL Editor* (troque o e-mail):

   ```sql
   insert into public.members (user_id, email)
   select id, email from auth.users where email = 'seu@email.com';
   ```

   Sem isso as funções respondem "Sua conta ainda não foi liberada". É a segunda barreira de segurança,
   além do login: só quem está em `members` lê dados e controla a casa (RLS em todas as tabelas).

7. **Agendamento do histórico** (pg_cron a cada 10 min). No *SQL Editor*:

   ```sql
   select vault.create_secret('https://SEU-REF.supabase.co', 'sarry_project_url');
   select vault.create_secret('O-MESMO-CRON_SECRET-DO-PASSO-3', 'sarry_cron_secret');
   ```

   Para conferir depois de uns 10 minutos:

   ```sql
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   select status_code, content from net._http_response order by created desc limit 5;
   ```

### 1.3 Rodar o app

**Na web, sem computador (Vercel)**: siga a seção 4.3 agora mesmo. A Vercel publica uma prévia de cada
branch, então dá para testar antes de juntar na `main`.

**No celular com Expo Go (precisa de um computador por alguns minutos)**:

1. Instale o Node.js 22 e rode `git clone`, depois `npm install` na pasta do projeto.
2. Copie `.env.example` para `.env.local` e preencha `EXPO_PUBLIC_SUPABASE_URL` e
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (nunca coloque segredos da Tuya nesse arquivo).
3. `npx expo start`. Escaneie o QR com o **Expo Go** (versão para o SDK 58) no celular, na mesma rede Wi-Fi.
   Aperte `w` para abrir a versão web no navegador do computador.

### Teste da Fase 1

1. Abra o app e entre com o e-mail e a senha do passo 1.2.5.
2. Vá em **Ajustes > Diagnóstico dos dispositivos > Rodar diagnóstico**.
3. Devem aparecer os 6 aparelhos, cada um com *Status atual* e *Comandos aceitos*.
4. Toque em **Copiar JSON** e me envie, principalmente a parte do ar-condicionado. Com isso eu ajusto
   qualquer data point fora do padrão (o app já reconhece os nomes mais comuns sozinho).

Se der erro, a mensagem diz o motivo. Os mais comuns:

| Mensagem | Causa provável |
| --- | --- |
| `Tuya: sign invalid` | Access ID/Secret trocados ou com espaço |
| `Tuya: permission deny` / `No permissions` | Serviço de API não assinado ou data center errado em `TUYA_BASE_URL` |
| Lista vazia | `TUYA_UID` errado ou conta do app não vinculada ao projeto |
| `Sua conta ainda não foi liberada` | Falta o passo 1.2.6 |

---

## Fase 2: Início e Ar-condicionado

Nada novo para configurar.

### Teste da Fase 2

1. **Início**: saudação com data, *Hub online*, resumo (luzes acesas, temperatura do ar, aparelhos online),
   card do ar e grade de luzes. Interruptores com várias teclas aparecem como uma luz por tecla.
2. Toque numa luz: ela muda na hora (atualização otimista) e o celular vibra. Desligue o Wi-Fi do
   celular e toque de novo: a luz volta ao estado anterior e aparece o aviso de falha.
3. Toque no card do ar: dial com temperatura alvo e ambiente, botões + e −, liga/desliga, modo,
   ventilação e os extras (swing, sono, eco, turbo) que o seu aparelho tiver. Os botões + e −
   esperam você parar de tocar (0,7 s) antes de enviar, para não gastar cota.
4. **Ajustes > Dispositivos**: renomeie aparelhos e teclas, defina cômodos, oculte o que não quiser ver.
   Puxe a tela do Início para baixo para atualizar.

---

## Fase 3: cenas, automações, histórico e Uso

1. No app Smart Life/Nova Digital, crie cenas do tipo **Toque para executar** chamadas
   **Cheguei**, **Dormir** e **Sair** (ou mude os nomes em *Ajustes > Cenas rápidas*).
2. Em **Ajustes > Energia**, informe a tarifa (R$/kWh da sua conta de luz, com impostos) e a
   potência do ar em watts (etiqueta do aparelho).
3. O histórico começa a ser gravado quando o pg_cron (passo 1.2.7) estiver ativo.

### Teste da Fase 3

1. **Cenas**: as cenas aparecem como cards; toque para executar. Ative e pause uma automação.
2. **Início > Cenas rápidas**: Cheguei, Dormir e Sair executam as cenas com esses nomes.
3. **Uso**: depois de algumas horas, aparecem as horas do ar por dia, o tempo de cada luz hoje,
   o custo estimado e o feed de atividade. Os comandos do app entram na hora; mudanças feitas
   por interruptor físico ou pelo app da Tuya entram no próximo snapshot (até 10 min).

---

## Fase 4: push, atalhos, painel de parede, APK e web

### 4.1 Expo / EAS (APK)

1. Crie uma conta em <https://expo.dev> e um projeto chamado **sarry** (*Projects > Create project*).
   Copie o **Project ID** e cole em `app.config.ts`, na constante `EAS_PROJECT_ID`
   (pode editar pelo próprio site do GitHub).
2. No projeto do expo.dev, **Environment variables**: crie `EXPO_PUBLIC_SUPABASE_URL` e
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (visibilidade *Plain text*) para os ambientes *preview* e *production*.
3. Crie um token em *Account settings > Access tokens* e salve no GitHub como segredo `EXPO_TOKEN`.
4. No GitHub: *Actions > Gerar APK (EAS) > Run workflow* (perfil *preview*). O build roda na nuvem do
   Expo (10 a 20 min, na fila gratuita). O link aparece em expo.dev > *Builds*.
5. Abra o link no celular, baixe o APK e instale (permita "instalar apps desconhecidos" quando pedir).

Com computador, o equivalente é `npx eas-cli@latest build -p android --profile preview`.

### 4.2 Notificações push (Android)

O push remoto no Android precisa de um projeto Firebase gratuito:

1. <https://console.firebase.google.com> > *Adicionar projeto* (pode desligar o Analytics).
2. *Adicionar app > Android*, pacote `com.sarry.app`. Baixe o `google-services.json`.
3. No expo.dev, *Environment variables*: crie a variável **GOOGLE_SERVICES_JSON** do tipo *File*
   (visibilidade *Sensitive*) com esse arquivo, nos ambientes *preview* e *production*.
4. No Firebase, *Configurações do projeto > Contas de serviço > Gerar nova chave privada*.
   No expo.dev, *Credentials > Android > com.sarry.app > FCM V1 service account key*, envie esse JSON.
5. Gere um novo APK (4.1.4) e instale.
6. No app: **Ajustes > Ativar notificações neste aparelho**.

Os alertas são avaliados a cada snapshot: luz acesa há mais de 3 h (ajustável) ou acesa depois de 1h da
manhã, e aparelho offline há mais de 15 min. Cada situação gera um aviso só uma vez.
No iOS, push e build exigem a conta Apple Developer (US$ 99/ano); o Expo Go não recebe push.

### 4.3 Web (Vercel)

1. <https://vercel.com> > *Add New > Project* > importe o repositório `sarry` do GitHub.
2. O `vercel.json` já define build (`npm run build:web`) e pasta (`dist`). Em *Environment Variables*,
   crie `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. *Deploy*. Cada push na `main` publica a versão de produção; outras branches ganham uma URL de prévia.

### Teste da Fase 4

1. **Atalhos no ícone** (APK no Android): toque e segure o ícone do Sarry: *Dormir*, *Sair* e
   *Desligar o ar*. Cada um abre o app, executa e volta ao Início. Não funcionam no Expo Go.
2. **Painel de parede**: *Ajustes > Modo painel de parede*. Relógio grande, cenas, ar e luzes, tela
   sempre ligada e status atualizado a cada 2 min. Na web, o botão de tela cheia fica no canto.
3. **Push**: deixe uma luz acesa além do limite (ou baixe para 1 h em Ajustes) e espere o snapshot.
4. **Biometria**: *Ajustes > Segurança > Desbloquear com biometria*. Feche e abra o app.
5. **Web**: abra a URL da Vercel no computador e no celular; o layout fica centralizado no computador.

---

## Referência rápida

| Onde | O quê |
| --- | --- |
| Supabase > Edge Functions > Secrets | `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_BASE_URL`, `TUYA_UID`, `CRON_SECRET` |
| Supabase > Vault (SQL) | `sarry_project_url`, `sarry_cron_secret` |
| GitHub > Actions secrets | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, `EXPO_TOKEN` |
| expo.dev > Environment variables | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_SERVICES_JSON` |
| Vercel > Environment Variables | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `.env.local` (só no computador) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

A chave *publishable/anon* do Supabase é pública por natureza (vai dentro do app); quem protege os dados
é o RLS. A chave *service_role* e os segredos da Tuya nunca saem do Supabase.
