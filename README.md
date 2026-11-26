# FieldOps — Aplicativo Mobile

App de campo do FieldOps, para o técnico executar inspeções no ativo: receber a carteira do dia,
verificar o equipamento por QR Code, responder o checklist, registrar evidências fotográficas e não
conformidades, e enviar para revisão do supervisor.

Fala com a **mesma API** da interface administrativa ([`Project-FielOps/API`](https://github.com/Project-FielOps/API)), então tudo que o técnico faz aqui
aparece lá: as respostas entram na inspeção, as evidências ficam anexadas e as não conformidades
chegam para a revisão.

Stack: Expo SDK 57 (Expo Go), React Native 0.86, expo-router, TypeScript.

## O projeto FieldOps

Plataforma de **planejamento, execução e revisão de inspeções técnicas em campo**. Um supervisor
planeja a inspeção e monta o checklist na web; o técnico executa no celular, diante do ativo, com ou
sem sinal; o supervisor revisa, aprova ou reprova. Tudo fica auditado.

São três repositórios independentes:

| Repositório | O que é | Stack |
|---|---|---|
| [`API`](https://github.com/Project-FielOps/API) | Regras de negócio, autenticação, persistência e auditoria | Java 21 · Spring Boot 3.3 · PostgreSQL 16 |
| [`interface-administrativa`](https://github.com/Project-FielOps/interface-administrativa) | Web do supervisor: cadastros, modelos, planejamento e revisão | Angular 22 · Angular Material |
| [`aplicativo-mobile`](https://github.com/Project-FielOps/aplicativo-mobile) **← você está aqui** | App do técnico em campo | Expo SDK 57 · React Native |

### Arquitetura

```mermaid
graph LR
    subgraph campo["Em campo"]
        M["📱 aplicativo-mobile<br/>Expo Go"]
    end
    subgraph escritorio["No escritório"]
        W["🖥️ interface-administrativa<br/>Angular · :4200"]
    end
    subgraph servidor["Servidor"]
        A["⚙️ API<br/>Spring Boot · :8080"]
        D[("🗄️ PostgreSQL<br/>:5433")]
        F["📁 ./data/evidence<br/>fotos"]
    end

    M -->|"REST + JWT"| A
    W -->|"REST + JWT"| A
    A --> D
    A --> F
```

Não há comunicação direta entre o app e a web: **a API é o ponto de encontro**. O técnico responde o
checklist no celular e aquilo aparece na revisão do supervisor porque os dois falam com o mesmo
backend.

### Ciclo de vida de uma inspeção

```mermaid
stateDiagram-v2
    direction LR
    [*] --> ASSIGNED: supervisor agenda
    ASSIGNED --> IN_PROGRESS: técnico inicia
    IN_PROGRESS --> SUBMITTED: técnico envia
    SUBMITTED --> UNDER_REVIEW: supervisor abre
    UNDER_REVIEW --> APPROVED: aprovada
    UNDER_REVIEW --> REJECTED: reprovada com motivo
    REJECTED --> IN_PROGRESS: técnico corrige
    APPROVED --> [*]
```

| Etapa | Onde | Perfil |
|---|---|---|
| Cadastros, modelos de checklist, agendamento | Web | `ADMIN` · `SUPERVISOR` |
| Verificação do ativo, execução, evidências, não conformidades | Mobile | `TECHNICIAN` |
| Revisão, aprovação e reprovação | Web | `SUPERVISOR` |

### Subindo o ambiente completo

Na ordem — **banco → API → web / mobile**. Cada repositório detalha a sua parte no próprio README.

```bash
# 1. Banco (repositório API)
cd API && docker compose up -d

# 2. API — exige JDK 21; o Spring Boot 3.3.4 não roda bem em JDK mais novo
mvn -DskipTests package && java -jar target/fieldops-api-0.1.0.jar

# 3. Web
cd interface-administrativa && npm install && npm start

# 4. Mobile — celular na mesma Wi-Fi, aberto pelo Expo Go
cd aplicativo-mobile && npm install && npm start
```

| Porta | Serviço |
|---|---|
| `5433` | PostgreSQL (container) |
| `8080` | API · Swagger em `/swagger-ui.html` |
| `4200` | Interface administrativa |
| `8081` | Metro bundler (Expo) |

> No Windows, o firewall costuma bloquear entrada nas portas **8080** e **8081**. Se o celular não
> conectar no Expo Go, libere as duas para a rede privada.

### Usuários de desenvolvimento

O seed da API cria um usuário por papel — **apenas** no perfil `dev` e só com o banco vazio.

**As senhas não estão neste repositório.** Todas vêm de `FIELDOPS_SEED_PASSWORD`, que você define no
`.env` da API (veja `.env.example`). Sem essa variável o seed não roda, e nenhuma conta de
administrador com senha conhecida chega a existir.

| Perfil | E-mail | Usa |
|---|---|---|
| `ADMIN` | `admin@fieldops.local` | Web |
| `SUPERVISOR` | `supervisor@fieldops.local` | Web |
| `TECHNICIAN` | `technician@fieldops.local` | **Mobile** |
| `CLIENT_VIEWER` | `viewer@fieldops.local` | Web |
### Identidade visual — FieldOps Precision System

Web e mobile compartilham o mesmo sistema de design, de estética *Ultra-Modern Minimalism*:
autoridade técnica, muito respiro e baixa carga cognitiva para quem opera em campo.

| Eixo | Regra |
|---|---|
| Tipografia | Plus Jakarta Sans nos títulos · Inter no corpo · JetBrains Mono em dado técnico |
| Cor de ação | `#2563EB` sólido; semânticas só em status, validação e alerta crítico |
| Formas | 16px em cards · 12px em botões e campos · 8px em badges |
| Elevação | Camadas tonais: fundo `#FAF8FF`, superfície `#FFFFFF` com contorno de 1px |
| Badges | *Soft fill*: 10% da cor no fundo, 100% no texto |
| Alvo de toque | Nunca abaixo de 44px — o app é usado em pé, com luva |

Os tokens vivem em `src/styles/_tokens.scss` (web) e `src/theme/` (mobile). Mudar a marca é mudar
esses dois arquivos.

---

## Pré-requisitos

- Node 20+
- App **Expo Go** no celular (Android ou iOS)
- Celular e computador **na mesma rede Wi-Fi**
- Backend ([`API`](https://github.com/Project-FielOps/API)) rodando e Postgres no ar

## Como rodar

```bash
npm install
npm start
```

Leia o QR Code com o Expo Go (Android) ou com a câmera (iOS).

### Como o app encontra a API

Não há IP no código. O app usa como host da API o **mesmo endereço pelo qual o celular alcançou o
Metro** (`Constants.expoConfig.hostUri`), assumindo a porta `8080`. Isso importa na prática: o IP da
máquina muda com a renovação de DHCP, e qualquer valor fixo quebraria na troca de rede.

Para apontar para outro ambiente, defina a URL completa:

```bash
EXPO_PUBLIC_API_URL=https://api.suaempresa.com/api/v1 npm start
```

**Produção (AWS)**: a API não é exposta direto (a porta 8080 da EC2 do backend só aceita a EC2 do
painel). O app fala com o Nginx da EC2 do painel, que encaminha `/api/` para a API:
`http://98.83.4.152/api/v1` — já configurado nos perfis do `eas.json`. Para rodar no Expo Go contra
a AWS: `cp .env.example .env && npm start`.

### Build Android (APK)

```bash
npx eas build --platform android --profile preview   # gera o APK instalável
```

> **Firewall:** o Windows costuma bloquear conexões de entrada nas portas 8080 (API) e 8081 (Metro).
> Se o celular não conectar, libere as duas para a rede privada.

## Credenciais de desenvolvimento

O app foi feito para o perfil **TECHNICIAN**. O seed da API cria o usuário
`technician@fieldops.local`, cuja senha vem de `FIELDOPS_SEED_PASSWORD`, definida no `.env` da
[API](https://github.com/Project-FielOps/API) — não há senha neste repositório nem valor padrão.

Administrador e supervisor também entram, mas as telas são desenhadas para a execução em campo — o
planejamento e a revisão ficam na interface administrativa.
## Telas

| Tela | O que faz | API |
|---|---|---|
| Login | Autenticação | `POST /auth/login`, `GET /auth/me` |
| Início | Progresso do dia, próxima inspeção, atalhos | `GET /inspections?technicianId=` |
| Inspeções | Lista com busca e filtros (Todas/Hoje/Em andamento) | `GET /inspections` |
| Detalhes | Ficha do ativo, instruções, portão de verificação | `GET /inspections/{id}`, `GET /equipment/{id}` |
| Scanner QR | Identifica o ativo e confirma que é o certo | `GET /equipment/by-qr/{qrCode}` |
| Checklist | Responde por seção, com o controle certo por tipo | `PUT /inspections/{id}/responses/{itemId}` |
| Câmera | Evidência fotográfica com coordenada | `POST /inspections/{id}/evidence` |
| Não conformidade | Registra desvio com severidade | `POST /inspections/{id}/non-conformities` |
| Resumo | Fechamento, pendências e envio | `POST /inspections/{id}/submit` |
| Histórico do ativo | Inspeções anteriores no mesmo equipamento | `GET /inspections?siteId=` |
| Sincronização | Estado da rede e fila de operações | — |
| Perfil | Sessão, ambiente e saída | `POST /auth/logout` |

## Offline primeiro

Inspeção acontece em subsolo, casa de máquinas e área rural. O app trata a rede como opcional, e o
que o técnico faz offline **chega ao banco principal (PostgreSQL na AWS) exatamente uma vez**:

- **Outbox no SQLite** (`src/offline/queue.ts`, `fieldops.db`, migrações por `PRAGMA user_version`):
  toda escrita (início, reabertura, resposta, NC, foto, envio) é gravada antes da rede, sobrevive a
  reinício e é **isolada por técnico** no aparelho.
- **Idempotência no cliente**: cada operação nasce com um `operationId` (UUID) e um `deviceId`
  persistente. Respostas, início, NC e envio vão em lote para `POST /mobile/sync/push`; fotos vão pelo
  upload com o mesmo `operationId`. Reenviar algo já aplicado devolve `ALREADY_APPLIED` — sem
  duplicar nada.
- **Ordem por fase** (`src/offline/engine.ts`): início/reabertura → respostas → NCs → fotos → envio.
  A foto encontra a resposta e a NC no servidor (vínculo por `inspectionItemId` /
  `nonConformityOperationId`), e o envio só sai depois de tudo o que a API valida.
- **Falhas**: falha de rede/5xx mantém a fila e reagenda (1s, 2s, 4s, 8s, 16s com jitter, até 5
  tentativas automáticas; a volta da rede e "Sincronizar agora" sempre disparam). Recusa do servidor
  **nunca é descartada sozinha**: vira `conflito`, aparece na aba Sincronização com o motivo, bloqueia
  o restante daquela inspeção e o técnico escolhe "Tentar de novo" ou "Descartar".
- **Fotos não se perdem**: a câmera grava no cache; a foto é copiada para o diretório de documentos e
  só é apagada depois do upload confirmado.
- **Estado visível**: o status oficial vem do servidor; o aparelho mostra por cima o que está na fila
  (respostas preenchidas, "aguardando sincronização", conflitos) sem trocar o status oficial (ADR-008).
- **Carteira pronta para o campo** (`src/offline/refresh.ts`): após cada sincronização o app lê o feed
  `GET /mobile/sync/pull` por cursor (atribuição, cancelamento, revisão feitas na web) e baixa detalhe,
  checklist e ativo de cada inspeção em aberto — dá para executar sem ter aberto a inspeção antes.
  O QR Code é conferido contra o ativo baixado quando não há rede.

### Testes do offline

```bash
npm test          # motor de sync: ordem, idempotência, falha de rede, conflito, backoff, overlay
# E2E contra a API real + PostgreSQL (rede caindo no meio do envio, reenvio, pull, reabertura):
cd ../API && ./scripts/e2e/run-with-api.sh --reset -- npm --prefix ../aplicativo-mobile run test:e2e
```

## Sessão

O **refresh token** vai para o `SecureStore` (Keychain/Keystore): o aparelho é levado a campo e pode
ser perdido, então o segredo de longa duração fica sob proteção do sistema. O **access token** só
existe em memória, e o cliente HTTP o renova sozinho ao receber 401 — a renovação acontece dentro do
cliente, antes de qualquer tratamento de erro de tela, para o técnico não ser derrubado para o login
quando a sessão ainda podia ser salva.

## Verificação do ativo

O protótipo bloqueia o início da inspeção enquanto o técnico não confirma, no local, que está diante
do equipamento certo — é o que evita inspecionar o ativo vizinho e assinar por ele. O backend não
guarda esse estado (não existe endpoint), então ele vive no aparelho, por inspeção
(`src/inspection/verification.ts`).

## Identidade visual

Mesmo **FieldOps Precision System** da interface administrativa, portado para React Native em
`src/theme/`: Plus Jakarta Sans nos títulos, Inter no corpo, JetBrains Mono em dado técnico; card
16px / botão 12px / badge 8px; badges em *soft fill* (10% de fundo, 100% de texto); nenhum alvo de
toque abaixo de 44px, porque o app é operado com luva, em pé, às vezes sob chuva.

## Estrutura

```
app/                     rotas (expo-router)
  (tabs)/                Início, Inspeções, Sincronização, Perfil
  inspection/[id]/       detalhes, checklist, resumo, não conformidade, histórico
  scanner.tsx camera.tsx modais de câmera
src/
  api/                   cliente HTTP, endpoints e tipos espelhando os DTOs da API
  auth/                  sessão e restauração
  offline/               fila de escrita, cache de leitura, estado de rede
  inspection/            regras de resposta, item do checklist, verificação por QR
  components/            primitivas do design system
  theme/                 tokens e tipografia
```

## Limites conhecidos

- **Conflitos não têm resolução assistida**: o app preserva e sinaliza; decidir entre o valor local e o
  do servidor é do técnico (tentar de novo/descartar), como prevê a ADR-008.
- **HTTP sem TLS na AWS Academy**: o build Android libera tráfego HTTP (`usesCleartextTraffic`) porque a
  EC2 não tem certificado. Com HTTPS no servidor, remova essa opção do `app.json`.
- **Histórico do ativo**: a API filtra inspeções por local, não por equipamento; buscamos o local e
  refinamos no cliente. Correto porque um equipamento pertence a um único local, mas um filtro
  `equipmentId` seria mais direto.
- **`rulesJson`**: a API carrega o campo, mas o construtor de modelos ainda não define um schema. O
  app lê `{min, max, unit}` de forma tolerante para mostrar a faixa-alvo; sem isso, o campo numérico
  funciona como número simples.
- **Notificações push** não fazem parte deste build.
- **Dados de demonstração**: o seed da API cria usuários, clientes, locais e equipamentos, mas
  **nenhuma inspeção**. Para percorrer o fluxo é preciso publicar um modelo de checklist e agendar
  uma inspeção para `technician@fieldops.local` — as duas coisas se fazem na interface
  administrativa. Sem isso o app abre corretamente, porém vazio.
