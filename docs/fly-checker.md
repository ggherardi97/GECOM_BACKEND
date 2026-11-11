# FlyChecker

Páginas autenticadas: `/FlyChecker` (cadastro/edição) e `/FlyCheckerView` (buscas, histórico e alertas). Sem entrada no menu. O site valida a sessão no backend antes de renderizar; a API exige JWT e filtra tenant + usuário em todas as operações interativas.

## Provedor e acesso à API

Em 28/09/2026, a oferta **Amadeus for Developers Self-Service está descontinuada**. A documentação antiga de cadastro ainda aparece em mecanismos de busca, mas não deve ser usada para orientar uma conta nova. Referências oficiais:

- https://github.com/amadeus4dev/developer-guides
- https://amadeus.com/en/industry-messaging/statement-regarding-amadeus-for-developers-portal

O provedor padrão implementado é **SerpApi / Google Flights**. É um serviço terceiro que consulta resultados do Google Flights, não uma API oficial do Google.

1. Crie uma conta em https://serpapi.com/users/sign_up e confirme o cadastro.
2. Acesse https://serpapi.com/manage-api-key e copie sua chave privada.
3. Configure a chave somente nas variáveis do **backend**. Não coloque em JavaScript do navegador, Git ou mensagens públicas. O `.env` do backend já é ignorado pelo Git.
4. Confira a cota e os custos do plano antes de habilitar buscas contínuas: https://serpapi.com/pricing.
5. Reinicie o backend após definir as variáveis e faça uma busca com uma única data de ida e uma de volta. Confira o histórico e, depois, amplie os períodos.

Documentação do endpoint: https://serpapi.com/google-flights-api.

```dotenv
FLY_CHECKER_PROVIDER=serpapi
SERPAPI_API_KEY=preencher_localmente
FLY_CHECKER_ENABLED=true
FLY_CHECKER_INTERVAL_MINUTES=180
FLY_CHECKER_MAX_COMBINATIONS=5
FLY_CHECKER_PUBLIC_URL=https://convert-plus.com
```

`FLY_CHECKER_ENABLED=false` interrompe novas consultas automáticas/manuais; não apaga buscas/histórico. Sem chave, cadastro e histórico funcionam e as consultas ficam aguardando configuração. A chave não é devolvida em nenhum endpoint nem impressa nos logs do módulo.

O adaptador Amadeus permanece isolado como referência de integração legada. Sua presença **não garante funcionamento após a descontinuação nem compatibilidade com contratos Enterprise**. Para usar um acesso compatível confirmado pelo provedor:

```dotenv
FLY_CHECKER_PROVIDER=amadeus
AMADEUS_CLIENT_ID=preencher_localmente
AMADEUS_CLIENT_SECRET=preencher_localmente
AMADEUS_ENVIRONMENT=test
FLY_CHECKER_MAX_COMBINATIONS=25
FLY_CHECKER_TEST_EMAILS=false
```

## Comportamento e limites

- Em `/FlyCheckerView`, **Pausar** interrompe novas chamadas, inclusive as próximas etapas de uma execução em andamento, preservando o histórico. **Excluir busca** pede confirmação e remove a busca, consultas, preços e alertas em cascata. Uma request ou e-mail já enviado não pode ser desfeito. Ambas as ações exigem o usuário e tenant donos da busca.

- Ida e volta, 1 adulto, econômica, BRL, preço total; direto significa sem paradas em ambos os trajetos. “Não” permite voos diretos e conexões.
- Datas a partir de amanhã UTC; até 31 dias em cada janela, sujeitas ao teto de combinações válidas. Volta sempre depois da ida. Não há amostragem silenciosa de datas.
- SerpApi: por combinação, consulta as opções de ida ordenadas por preço e confirma as voltas das primeiras **3 opções disponíveis**. Armazena todas as ofertas normalizadas retornadas nessas confirmações. É o menor preço observado nessa cobertura, não uma garantia do menor preço do mercado.
- SerpApi: `no_cache=true` para consultar novamente a cada ciclo. Cada par pode consumir até **4 chamadas**. Uma busca com 1 par, a cada 3 horas, pode consumir até 32 chamadas/dia; com 5 pares, até 160. Chamadas manuais são adicionais. Não há compra nem ativação automática de plano.
- Códigos metropolitanos mapeados na SerpApi: NYC, SAO, RIO, LON, PAR e TYO. Para outros lugares, use o código do aeroporto.
- Até 20 buscas ativas por usuário; pausadas continuam no histórico. Datas e rota são imutáveis para preservar a comparação. Preço máximo, e-mail e estado podem ser editados.
- Cada execução registra estado `running`, `success`, `empty`, `partial` ou `error`. Resultados parciais ficam visíveis, mas não geram estatísticas nem alertas. Sem resultados não significa preço zero.
- O agendador verifica os vencimentos a cada minuto, sem consultar o provedor nesse intervalo. Cada busca é agendada a cada 3 horas a partir do início da execução (padrão de 180 minutos, configurável entre 30 e 1440 minutos). Sob carga ou indisponibilidade pode haver atraso. Processa até 10 buscas por lote sequencial; basta manter o backend ativo, sem navegador aberto.
- Trava atômica por busca no PostgreSQL, com token e validade de 12 minutos; limite de 8 minutos nas chamadas externas. Reinícios retomam execuções vencidas e marcam consultas interrompidas. Não depende de Redis.

## Histórico e oportunidades

Tabelas: `fly_checker_searches`, `fly_checker_checks`, `fly_checker_prices`, `fly_checker_alerts`. O schema está no Prisma; a migração é `1790553600000-CreateFlyChecker.ts`, aplicada pelo fluxo TypeORM existente. Dinheiro é persistido em `decimal(12,2)`. As tabelas são registradas no isolamento de tenant do Prisma e excluídas do disparo genérico de automações.

Média: menores preços das execuções completas dos últimos 7 dias, anteriores à consulta atual. Somente o mesmo provedor e ambiente participam. Média abaixo do normal exige ao menos 3 observações distribuídas em 2 dias UTC. Regras (qualquer uma basta):

- Preço estritamente abaixo do máximo cadastrado.
- Preço pelo menos 20% abaixo da média recente.
- Novo mínimo histórico, quando existe observação anterior comparável.

O melhor resultado de cada ciclo pode gerar um e-mail com todos os motivos, datas, companhia, preço, média, mínimo anterior e link para a busca. SMTP/Brevo é reaproveitado do `MailModule`. As configurações existentes `EMAIL_PROVIDER`, `BREVO_SMTP_*` ou `MAIL_*` e `EMAIL_FROM`/`MAIL_FROM` continuam válidas.

A mesma tarifa é identificada por itinerário e condições, sem usar IDs temporários do provedor. Depois de alertada, só volta a avisar se melhorar pelo menos 5% sobre o menor preço já alertado dessa tarifa. Há também intervalo de 24 horas por busca, dispensado em caso de melhora de pelo menos 5%. O estado fica no banco e sobrevive a reinícios.

Falhas de SMTP ficam registradas; até 3 tentativas para a mesma tarifa/preço quando a oportunidade volta a ser encontrada. Se o processo cair durante o envio, o alerta fica `uncertain` e não é reenviado automaticamente. SMTP não garante exatamente uma entrega em falhas ambíguas de conexão. Ambiente Amadeus de teste não envia e-mail salvo `FLY_CHECKER_TEST_EMAILS=true`; dados de teste nunca entram nas estatísticas de produção.

## Instalação e publicação

No Docker Compose local, as variáveis FlyChecker vêm do `.env` na raiz do backend. Para aplicar código e variáveis novos, execute `docker compose up -d --no-deps --build api`. Um simples restart não reconstrói a imagem nem atualiza as variáveis do container. `Cannot GET /api/fly-checker/status` indica que o backend atendendo à URL ainda não tem o módulo registrado; confirme a imagem em execução e o endereço do proxy. Sem autenticação, a rota existente responde 401.

No backend, use os comandos em sequência:

```powershell
npm ci
npm run prisma:generate
npm run build
npm run migration:up:prod
npm run start:prod
```

As variáveis de banco devem estar disponíveis ao processo de migração, como no deploy atual. O Dockerfile de produção já executa a migração no startup quando `RUN_MIGRATIONS_ON_START=true`. Não aplique a mesma alteração também com `prisma migrate deploy`: este módulo segue o fluxo TypeORM do projeto.

Publique/reinicie também o frontend. `BACKEND_API_BASE_URL` (ou `API_BASE_URL`) deve apontar para a raiz `/api` do backend, como as demais rotas do site. Nenhuma credencial de passagens é necessária no frontend.

## Verificação

```powershell
npm test -- --runInBand fly-checker
```

Integração com PostgreSQL isolado, sem chamadas reais de passagens e sem envio real de e-mails:

```powershell
docker run --detach --rm --name gecom-flychecker-test-db -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=flychecker_test -p 127.0.0.1:55439:5432 postgres:17
$env:FLY_CHECKER_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/flychecker_test'
node test/fly-checker.integration.cjs
docker stop gecom-flychecker-test-db
```

No frontend: `node --test tests/routing/flyChecker.test.js`.
