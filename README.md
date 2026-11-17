# DescomplexVS2

Aplicação React/TypeScript para transformar intenções em próximos passos:
tarefas, diagnóstico da Tríade do Tempo, sessões de foco, perfil e lembretes.
O login usa **Google Identity Services diretamente**, sem Firebase Authentication.
O Firestore continua armazenando os dados, acessível apenas pelo backend.

## Configurar o login Google no Netlify

1. Em [Google Cloud → Clientes OAuth](https://console.cloud.google.com/auth/clients),
   configure a tela de consentimento e crie um cliente OAuth do tipo **Aplicativo da Web**.
   Use o projeto correspondente ao seu aplicativo. Se o aplicativo estiver em teste,
   adicione as contas que poderão entrar como usuários de teste.
2. Em **Origens JavaScript autorizadas**, adicione a origem exata do Netlify,
   por exemplo `https://seu-site.netlify.app`, seu domínio próprio e, para desenvolvimento,
   `http://localhost:8888`. Não inclua caminhos. O fluxo com botão JavaScript não exige
   URI de redirecionamento. O ID termina em `.apps.googleusercontent.com`.
   Não é necessário habilitar Gmail API nem usar a chave da API do Firebase para entrar.
3. Crie uma conta de serviço dedicada no projeto Firestore `descomplex-b54c4`, com
   acesso aos dados (papel `Cloud Datastore User`). Gere seu JSON no Google Cloud.
   Esse JSON é privado: cadastre-o diretamente no Netlify e nunca no código ou no chat.
4. Em **Netlify → Environment variables**, configure as variáveis abaixo para
   **Functions**, no contexto de produção. Não use prefixo `VITE_` para segredos.

| Variável | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth Web do passo 2 |
| `SESSION_SECRET` | Segredo aleatório com no mínimo 32 caracteres |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Conteúdo completo do JSON da conta de serviço |
| `LEGACY_FIREBASE_UID_BY_GOOGLE_SUB` | Opcional: mapeamento para recuperar os dados de contas antigas, explicado abaixo |
| `VITE_FIREBASE_VAPID_KEY` | Opcional: chave Web Push para notificações; escopo Builds |

Para gerar `SESSION_SECRET` localmente, execute e copie o resultado para o Netlify:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

5. Conecte o repositório à branch `main` e faça um novo deploy. `netlify.toml`
   configura build `npm run build`, saída `dist`, Functions e rotas React/API.
   **É necessário publicar as Functions**, não apenas enviar a pasta `dist`.
   Firebase Hosting estático, `npm run preview` e `npm run dev` sozinhos não executam a API.

As antigas variáveis de autenticação `VITE_FIREBASE_*` e os provedores habilitados
em Firebase Authentication não controlam mais o login desta versão.
`src/firebase-config.json` possui apenas identificadores públicos usados pelo Cloud
Messaging. Credenciais de servidor nunca são incluídas no bundle do navegador.

## Desenvolver e validar

Use Node.js 22 ou superior. Copie `.env.example` para `.env` e preencha as variáveis
localmente (o arquivo é ignorado pelo Git). Depois execute:

```bash
npm ci
npm run dev:full
```

Abra `http://localhost:8888`. O comando usa Netlify CLI para servir Vite e Functions.
O domínio local também precisa estar autorizado no cliente OAuth Google.

```bash
npm run test:auth
npm run build
```

Os testes de backend cobrem assinatura/expiração de sessões, nonce, audiência,
emissor e e-mail verificado do Google, bloqueio de acesso sem sessão, isolamento
por usuário, proteção de origem, validação dos dados e migração de UID.
Os testes de interface com Google/API simulados cobrem o login, tarefas,
diagnóstico, perfil e layouts em desktop, tablet e celular.
O login real e a gravação em produção exigem configurar OAuth e conta de serviço.

## Como a autenticação funciona

O botão oficial recebe um ID token Google. O servidor verifica sua assinatura,
audiência, emissor, validade, e-mail verificado e nonce. Em seguida emite uma sessão
assinada com prazo de sete dias, em cookie `HttpOnly`, `SameSite=Lax` e `Secure`
em HTTPS. O navegador não armazena tokens no `localStorage`.

As rotas de dados derivam o UID da sessão validada; o cliente não pode escolher
outro usuário. O backend aplica validação dos dados porque o SDK Admin do Firestore
não usa as regras do cliente. As regras existentes não foram abertas.
Tarefas e resultados são atualizados após cada alteração, ao voltar à janela e a
cada 30 segundos com o app visível.

## Recuperar dados de contas antigas

O identificador Google (`sub`) difere do UID que o Firebase Authentication gerava.
Os dados existentes **não são apagados nem movidos automaticamente**. Antes de
liberar uma conta antiga, configure no servidor um JSON como:

```json
{"GOOGLE_SUB_DA_CONTA": "UID_ANTIGO_DO_FIREBASE"}
```

Cadastre esse JSON em `LEGACY_FIREBASE_UID_BY_GOOGLE_SUB` no Netlify. O mapeamento
é definido pelo administrador, nunca por informações enviadas pelo visitante.
Para usuários que já entravam com Google no Firebase, `providerUserInfo` de uma
exportação administrativa de usuários contém o identificador Google e o UID antigo.
Contas antigas de e-mail/senha exigem verificar a titularidade antes de associar.
Sem mapeamento, contas Google novas usam `google_<sub>` e começam com dados vazios.
As coleções continuam sendo `users/{uid}/tasks`, `users/{uid}/diagnoses` e `profiles/{uid}`.

## Notificações

Cloud Messaging continua registrando os tokens pelo backend autenticado.
A função agendada em `functions/` continua responsável pelos lembretes diários,
com o mesmo UID do perfil. Ela precisa estar publicada no Firebase e pode exigir
plano Blaze. Para publicá-la separadamente:

```bash
npm --prefix functions ci
npx firebase-tools deploy --only functions --project descomplex-b54c4
```

## Interface e imagens

Layout responsivo, banner fotográfico, diagnóstico com imagem discreta, sessão de
foco com natureza e progresso circular, perfil com preferências e exemplo visual
de lembrete, tarefas com busca, filtros, indicadores e ordenação.

Fotos locais obtidas do Unsplash:

- Painel/login: https://images.unsplash.com/photo-1499951360447-b19be8fe80f5
- Diagnóstico: https://images.unsplash.com/photo-1497215728101-856f4ea42174
- Foco: https://images.unsplash.com/photo-1441974231531-c6227db76b6e
- Perfil: https://images.unsplash.com/photo-1497366754035-f200968a6e72

O ZIP antigo no repositório é um artefato legado e não corresponde à versão atual.
Use os arquivos da branch `main`.
