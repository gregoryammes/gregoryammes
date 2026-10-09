# SKA Tech Hub — Temporal Studio

> **V4 · Executive Light.** Tema claro como padrão; timeline em matriz contínua com coluna fixa de
> nomes, cabeçalho em quatro níveis (projetos · anos · semestres · meses) e quatro grupos de
> leitura; vigência documental e vigência simulada em linhas separadas; Jornada formativa por
> turmas; Modo Diretoria em fundo branco. Detalhes na seção [Redesign V4](#redesign-v4--executive-light).

Ferramenta de planejamento temporal para os Projetos 1, 2 e 3 do SKA Tech Hub. O mesmo
conjunto de dados alimenta duas experiências:

- **Estúdio**: editor de linha do tempo inspirado no Figma, com arraste, redimensionamento, camadas,
  cenários, anotações, conexões, desfazer/refazer, persistência e exportações.
- **Modo Diretoria**: apresentação executiva 16:9 em 4 cenas, montada a partir do cenário ativo,
  com a narrativa **Explicar Vigência** e um **Modo Design** para ajustar a composição.

A pergunta que a ferramenta responde: *como os Projetos 1, 2 e 3 se conectam ao longo do tempo,
quais ações continuam depois do fim das vigências e quais decisões são necessárias para garantir a
continuidade.*

## Executar

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # testes de cálculo temporal (vitest)
node scripts/e2e.mjs   # roteiro de aceitação no navegador (requer `npm run dev` e Chromium)
npm run build:single   # gera dist-single/index.html, um arquivo autocontido (Artifact, projetor offline)
node scripts/to-artifact.mjs   # converte o build em fragmento de página para Claude Artifacts
```

## Arquitetura escolhida

| Opção avaliada | Decisão |
|---|---|
| React + SVG próprio | **Escolhida para o editor.** Datas são a fonte de verdade: cada barra é posicionada por `x = (dia − x0) × px/dia`. O SVG é nítido em qualquer zoom, exporta para SVG/PNG e permite hachuras, tracejados e marcadores sem depender de biblioteca. |
| Canvas / bibliotecas de Gantt | Descartadas. Gantts prontos modelam "tarefas com dependências" e não comportam cinco dimensões temporais independentes (planejamento, vigência, execução pedagógica, financeira e bolsas), nem cenários sobrepostos. |
| React Flow / tldraw | Descartadas por ora. Anotações livres, caixas, marcadores e conexões foram implementados no próprio SVG, para que fiquem ancorados em **datas** e não em coordenadas soltas. |
| Three.js | Usado na V3 como camada de apresentação (Cena 1); **removido na V4** a pedido de uma Diretoria sem efeitos 3D: os ciclos aparecem como plataformas sobre um trilho temporal, com a vigência como um "portal" iluminado. Todas as datas que o público lê são desenhadas em 2D, em escala linear; a perspectiva nunca carrega uma medida. A cena foi prototipada antes com o conector **Three.js 3D Viewer**. |
| Spline MCP | Não estava disponível nesta sessão. Nada no produto depende dele. |

Stack: Vite + React 19 + TypeScript + Tailwind CSS v4 em estrutura shadcn (`components.json`,
`@/components/ui`, `@/lib/utils`), Zustand para o estado, `motion` para transições, `three` para a
camada 3D e `lucide-react` para ícones.

```
src/
  lib/dates.ts        aritmética de calendário (dias UTC, intervalos semiabertos, meses-calendário, encaixe)
  lib/analysis.ts     cenários (base + diferenças), continuidade após a vigência, indicadores, comparação
  data/types.ts       entidades: projetos, itens, cenários, anotações, conexões, fontes, decisões, composição
  data/seed.ts        dados iniciais, todos marcados com o nível de evidência do briefing
  store/store.ts      documento único, histórico (desfazer/refazer), roteamento de edições por cenário, persistência
  studio/             Estúdio: TopBar, LeftSidebar, TimelineCanvas, PropertiesPanel, BottomBar, Dialogs
  board/              Modo Diretoria: Board (palco 16:9), Stage (Movable/Notas), Scene1–4, ThreeRails
  components/ui/      button, agent-trace (componente integrado, usado no "Rastro da sessão")
```

### O componente `agent-trace`

O componente foi copiado sem alterações para `src/components/ui/agent-trace.tsx`, com a demonstração
em `src/components/demo/agent-trace-demo.tsx`. No produto, ele aparece como **Rastro da sessão**,
que fica na barra inferior do Estúdio. Cada gesto (arrastar, redimensionar, salvar, importar, trocar
de cenário, desfazer) vira uma faixa com a duração real do gesto. As edições bloqueadas aparecem como
falha e o desfazer/refazer aparece como "cache". Ali é possível rever o que foi alterado na sessão.

## Regras temporais

- As datas são datas de calendário ISO, sem fuso horário. As contas são feitas em números de dia
  (`Date.UTC`).
- Na interface, a data final é **inclusiva**. Internamente, o intervalo é **semiaberto**
  `[início, fim+1)`, o que torna exatos as durações, as interseções e as adjacências.
- Funções disponíveis: `intersect`, `partBefore`, `partWithin`, `partAfter`, `calendarMonthsTouched`,
  `fullCalendarMonths` e `lengthDays`.
- Exemplo central testado: Técnico 1 de fev/2026 a dez/2027 com vigência até 30/06/2027. O período
  posterior é **01/07/2027–31/12/2027**, ou seja, **6 meses-calendário** (184 dias). Esse número é
  temporal e não é um cálculo proporcional financeiro.
- O alerta de continuidade só aparece para registros com datas determinadas. As ações do P1 sem data
  comprovada ficam fora do cálculo.

## Cenários

- A **Linha de base documental** guarda os registros. Os cenários guardam apenas diferenças
  (`overrides`, `added`, `removed`).
- **A vigência é protegida na base.** Ao arrastar ou digitar uma nova data de vigência na base, a
  alteração vai automaticamente para o **Cenário de trabalho** e o aviso informa isso.
- Todo período simulado é exibido como **hipótese**: barra tracejada, selo Δ e contorno "fantasma" na
  posição original. Com **Comparar**, outro cenário aparece sobreposto em lilás.
- O cenário alternativo de exemplo simula a vigência até 31/12/2027 e o Projeto 3 começando em jan/2028.
- Quando o cenário apresentado não é a base, a Diretoria exibe a faixa **SIMULAÇÃO — não representa
  aprovação**.

## Integridade das informações

Nenhum documento oficial foi anexado nesta sessão. Por isso, todos os registros vêm do texto do
briefing e estão marcados como **A validar**, **Planejado**, **Não confirmado** ou **Hipótese**. Nada
aparece como *comprovado*. Em particular:

- O início jurídico da vigência do P2 não foi confirmado. A data 31/05/2025 serve apenas como
  referência visual do marco informado. O período operacional jul/2025–jun/2027 é mantido como
  registro separado, a conciliar.
- O orçamento demonstrativo de R$ 3.750.000,00 está registrado como **não confirmado** e não entra em
  "valores documentados".
- O Curso Técnico 2 e suas bolsas são cenário. O Projeto 3 é proposta, com a hipótese de 36 meses.
- Campos sem informação ficam vazios ("não informado") e nunca são preenchidos com zero.

## O que está implementado e o que não está

Implementado e verificado (`scripts/e2e.mjs`, 18/18 verificações; `npm test`, 13/13 testes):
criar curso, arrastar (com duração constante), redimensionar pelas duas bordas, alterar a vigência em
cenário, continuidade após a vigência, Diretoria igual ao cenário ativo, Explicar Vigência (8 etapas,
reversível), sincronização entre Estúdio e Diretoria, desfazer/refazer, salvar/recarregar e
exportar/importar JSON.

Também disponível: zoom com Ctrl+roda ou pinça ancorado no cursor, visões anual, trimestral, mensal e
semanal, ajuste ao conteúdo, navegação arrastando o fundo, com espaço + arraste ou pela roda,
minimapa, seleção múltipla (Shift e marquee), deslocamento de grupo, copiar/colar/duplicar, exclusão
com confirmação, bloqueio, camadas ocultáveis e recolhíveis, encaixe por dia, semana, mês ou
trimestre, anotações (nota, caixa, comentário, marcador, destaque), anotações vinculadas que
acompanham o item, conexões, exportação SVG/PNG da timeline e Modo Design (mover, redimensionar,
ocultar, escalar e colorir elementos de cena, notas com seta, restaurar composição).

Limitações conhecidas:
- **PDF** e **PowerPoint**: não implementados. Fora de ambientes restritos, use "Imprimir → Salvar
  como PDF" do navegador.
- Em visualizadores com sandbox (Claude Artifacts), downloads e `confirm()` são bloqueados. As
  confirmações acontecem dentro da página e cada exportação abre uma janela com **Copiar conteúdo**;
  **Importar colando JSON** completa o ciclo de backup.
- A persistência usa o `localStorage` do navegador e vale só para esse navegador. Para backup ou
  troca de arquivos, use Exportar/Importar JSON.
- Notas de cena vinculadas a um curso seguem a data do curso apenas na Cena 3. Nas outras cenas, a
  posição é livre.
- A identidade visual usa uma marca provisória (sem arquivo oficial do SKA nesta sessão) e a paleta
  institucional descrita: azul corporativo, azul-marinho, azul tecnológico, laranja, branco e cinzas.


## Redesign V4 — Executive Light

Mudanças em relação à primeira versão, mantendo modelo de dados, edição e testes:

- **Tema claro** (fundo `#F7F9FC`, timeline branca, texto `#18324A`). A cor indica o **projeto**
  (P1 verde, P2 azul, P3 azul-marinho tracejado enquanto for proposta). A **situação** aparece na
  forma da barra: sólida (em execução ou previsto), clara com contorno (planejado), tracejada
  (cenário), cinza pontilhada (não confirmado) e intervalo pontilhado "data a validar" para ações
  históricas sem data comprovada. Essas ações nunca aparecem como barra contínua.
- **Quatro grupos recolhíveis**: 01 Planejamento e vigência · 02 Execução educacional · 03 Bolsas e
  compromissos · 04 Suporte operacional. Na **visão limpa** ficam projetos, vigência, cursos e
  bolsas. Turmas, atividades, contratos, marcos e operação aparecem em "+ itens de detalhe" ou em
  Filtros → Detalhada. Arrastar uma barra na vertical muda só a linha ou o grupo; as datas não mudam.
- **Escala**: abre em 2025–2028. Há atalhos para 2023–2027, 2023–2030 e intervalo personalizado. O
  detalhamento se adapta ao zoom (anos → semestres → trimestres → meses → semanas), os rótulos que
  não cabem são omitidos e o zoom mínimo mostra no máximo cerca de 12 anos.
- **Vigência**: a linha vermelha marca o encerramento documental e a região posterior recebe fundo
  rosado. O trecho das barras depois dela é listrado e indica os meses-calendário. Num cenário, a
  vigência simulada ganha **linha própria** ("Vigência — cenário simulado") e uma linha vertical
  tracejada. A data documental nunca é substituída.
- **Painel de propriedades** só abre com uma seleção e fecha com ✕. As seções são Identificação,
  Período, Classificação, Situação, Vínculos e Fonte documental. Os campos financeiros aparecem só
  para tipos relevantes.
- **Indicadores** foram reduzidos a uma faixa recolhível (projeto ativo, cursos ativos, registros
  após a vigência, decisões pendentes), com legenda em linha. O histórico da sessão (`agent-trace`)
  fica dentro dela.
- **Jornada formativa** (aba no cabeçalho): matriz anos × turmas, calculada a partir dos registros e
  sem dados duplicados. Uma turma é identificada pelo ano em que cursa o 9º ano. Um curso técnico
  iniciado no ano S pertence à turma S−2. Clicar numa célula abre o registro.
- **Modo Diretoria** em fundo branco, sem 3D (o Three.js foi removido). As cenas são: 1 ciclos
  numa linha do tempo limpa; 2 a mesma matriz de jornada em escala de palco; 3 "A vigência termina.
  A formação continua.", com **Explicar Vigência** em 6 passos curtos; 4 decisões e alternativas de
  continuidade com o impacto temporal de cada cenário.
- Documentos salvos pela versão anterior são migrados ao abrir (`src/data/migrate.ts`): muda só a
  posição nas linhas e grupos, nunca datas, situações ou valores.

Referência visual usada: o quadro "Tempo Vigência x Projeto" enviado pelo usuário. Os registros
desse quadro (bolsas de inglês, NF-e, quantidades de alunos, valores mensais) **não** foram
importados, porque a maioria não traz datas legíveis e o briefing pede para não presumir. Eles podem
ser cadastrados quando houver a tabela de origem.

## V6 — Temporal Intelligence

Três níveis sobre a mesma base de dados: **Portfólio** (só os projetos), **Execução** (atividades
de um projeto) e **Continuidade** (um registro comparado à vigência, com seus compromissos e os
cenários futuros).

- **Exibição** (barra da timeline): *Somente Projetos*, *Projetos + Atividades* ou *Somente
  Atividades Filtradas*. Os botões **P1 · P2 · P3** mostram ou ocultam cada projeto e suas
  atividades. Clicar num projeto abre o **Resumo do projeto** com a ação **Explorar este
  projeto**. Esses controles mudam só a visualização: nenhum registro, vínculo ou cenário é
  alterado. A escolha fica salva neste navegador.
- **Turmas** são entidades próprias (`doc.turmas`), separadas do **curso** de catálogo
  (`doc.courses`), da **oferta** (o registro `curso`, como Técnico 1) e da **geração**
  (`doc.generations`). A barra mostra `Técnico 1 · Turma 2026–2027`; a quantidade de alunos só
  aparece quando está comprovada. Sem turma vinculada, aparece "Turma a identificar". O painel
  permite cadastrar, editar, vincular, desvincular e excluir turmas. O filtro **Turma:** atenua ou
  oculta o que não tem relação com a turma e mantém a vigência visível.
- **Bolsas de Inglês** aparecem numa única linha consolidada (`consolidation: "ingles"`), com um
  segmento por período e subfaixas quando os períodos se sobrepõem. Os registros, parceiros e
  valores continuam separados. A soma de bolsistas não é tratada como número de alunos distintos.
- **Dois Tempos do Projeto** (aba e cena 3 da Diretoria): Tempo 1 é a vigência; Tempo 2 é a
  execução das atividades. Os dois ficam no mesmo eixo, e o trecho após o encerramento aparece em
  laranja. **Explicar dois tempos** tem 7 passos: vigência → encerramento → curso → trecho
  posterior → bolsas → situação temporal × financeira → cenários do P3.
- **Situação temporal × situação financeira** são campos independentes. A temporal é calculada
  (dentro, parcial, integral, sem referência). A financeira é cadastrada (cobertura documentada,
  pagamento antecipado, compromisso previsto, pagamentos condicionados, não identificada,
  pendente). "Após a vigência" nunca significa "sem cobertura".
- **Marco documental × hipótese:** a linha do encerramento é lida sempre da linha de base (laranja
  escuro, contínua, "linha de base documental"). A vigência de um cenário aparece tracejada e com
  etiqueta própria. Datas revisadas por evidência ficam registradas no histórico do registro
  (`revisions`).
- **Jornada formativa:** *conceitual* (Pré-entrada → 9º ano → 1º EM → Técnico 1 → Técnico 2 →
  Graduação, mais as atividades complementares), *real por turma* (só o que está vinculado à
  turma; o restante aparece como "não informado") e *matriz de gerações*.
- **Migração:** antes de migrar um documento salvo, o original é copiado para
  `ska-temporal-studio:v1:backup-v5` no armazenamento local. Os IDs são preservados.

Dados acrescentados na V6, todos marcados *a validar*, com a fonte "Quadro Tempo Vigência x
Projeto":
- Turma Técnico 2026–2027 (27 alunos informados, não comprovados).
- Turma prevista 2027–2028 (cenário).
- Três períodos de Bolsas de Inglês, cujas datas foram em parte lidas da posição das barras no
  quadro.
- Situação financeira inicial "pendente de validação".
- Início da vigência ajustado para 01/07/2025, conforme o período operacional informado, com
  histórico. O marco de 31/05/2025 continua em registro próprio.

Pendências: não há painel dedicado para cadastrar cursos de catálogo nem gerações (o modelo e o
vínculo existem); turmas que existem apenas em um cenário não são suportadas.

## V8 — Projeto → Curso → Componentes

A timeline passa a ser hierárquica. Cada curso é **uma ação principal**; aquisição, pagamentos, bolsas, notas fiscais e materiais ficam em sublinhas recolhíveis da própria ação. A matriz por categorias da V6 continua disponível em *Exibição → Outras visões*.

**Níveis (Exibição):** `Somente Projetos` (três faixas) · `Projetos + Cursos` (padrão: cada ação em uma linha, com etiquetas) · `Projetos + Cursos + Detalhes` (todas as ações expandidas). Em qualquer nível, a seta ao lado de uma ação abre ou fecha só aquela ação; a seta do projeto recolhe a seção inteira.

**Modelo (`src/data/types.ts`, `FinRecord`):** registros financeiros e documentais são entidades próprias, ligadas à ação por `actionId` (e ao contrato por `parentId`). Tipos: aquisição, pagamento, NF, parcela de bolsa, material, serviço. Situação financeira da aquisição (`acqStatus`) e comprovação (`proof`) são campos separados; as 7 etapas da compra têm data e evidência próprias e nenhuma marca outra. Valor ausente é `null` (“não informado”), nunca zero. Um registro aparece em várias visões, mas os totais são somados por id (`finTotals`).

**Etiquetas:** “Pago” só quando uma aquisição está registrada como integralmente paga; sem registro de aquisição a etiqueta é “Pagamento a validar”. “Compra a formalizar” quando a negociação foi registrada e o contrato não.

**Filtros (só visualização):**
- P1/P2/P3: ocultar um projeto esconde as ações exclusivas dele. Uma ação de outro projeto com participação explícita de um projeto visível (`Item.funding` ou `FinRecord.fundingProjectId`) continua visível, marcada “participação do P2 · resp. P1”, mostrando só os componentes financiados pelo projeto visível. Nenhuma despesa é transferida.
- Menu ▾ dos projetos: mostrar somente um, ajustar período ao projeto, **ocultar atividades concluídas e aquisições pagas** — só some o que terminou, tem aquisição paga e nenhum compromisso aberto (parcela, NF/pagamento previsto, comprovação pendente); o que tem pendência fica visível com aviso.
- Turma (com gerações, quando cadastradas) e Situação financeira (aquisição paga · a adquirir · compromissos futuros · informações a validar).

**Escala:** presets Histórico 2023–2025, Ciclo atual 2025–2028, Panorama 2023–2030 e personalizado. Barras que começam antes ou terminam depois da janela ganham uma seta discreta na borda (◂ ▸). Pagamentos e NFs são marcos nas datas reais; quando só se sabe uma janela (“dentro da vigência”), aparece um colchete tracejado com “data a definir”.

**Cores:** azul = execução educacional; verde = evento financeiro comprovado; laranja = período após a vigência (sobreposição moderada, não um veredito financeiro); roxo = cenário hipotético; cinza = previsto/não confirmado (sempre com rótulo); vermelho fica para alertas fundamentados.

**Diretoria:** nova cena 2 “Cursos e compromissos”. Começa com cada curso recolhido; ao escolher um, mostra a síntese gerada dos registros e revela, por etapas, aquisição, bolsas, NF, materiais e compromissos após a vigência — sem editar dados. A cena “Continuidade” lista a situação de aquisição de cada curso.

**Dados acrescentados nesta versão (todos “a validar”, fonte registrada):**
- Técnico 1: aquisição “integralmente paga” com comprovação pendente (fonte: briefing V8 e quadro de referência). Fornecedor, datas, valores e documento não informados — o painel avisa “pago sem registro de pagamento”. Início de referência ajustado de fev/2026 para 18/02/2026, com histórico no registro.
- Técnico 2: fornecedor Senai, etapas 1 (planejamento) e 2 (negociação concluída em 02/10/2026) registradas; contrato, NF, pagamento e comprovação não registrados. Pagamento único e NF única previstos, desenhados como janela de 02/10/2026 a 30/06/2027 (“data a definir”).
- Nomes curtos das ações do P1 (“Curso Técnico Piloto” etc.). As datas do P1 continuam a validar.
- Não foram criados registros de Jornada Tecnológica e Robótica no Projeto 2, materiais, NFs emitidas nem parcelas de bolsa: não havia dados.

**Migração:** documentos salvos (modelo 6) são copiados para `ska-temporal-studio:v1:backup-v6` antes de migrar; IDs são preservados; a migração é idempotente e não reescreve datas já editadas.

**Testes:** `npm test` (40 testes: cálculo de datas, hierarquia, filtros, vínculos múltiplos, contagem única, migração) e `node scripts/e2e.mjs <url>` (46 verificações no navegador, incluindo os 13 cenários de aceitação da V8).

**Pendências conhecidas:** a barra lateral “Elementos” ainda lista por categoria; não há importação de planilhas de NF/pagamentos; parcelas de bolsa são cadastradas uma a uma.

## V11 — Timeline visual, edição direta e Projeto 3

**Tela principal (Exibição → “Projetos e modalidades”, padrão).** Três regiões:
1. **Projetos** — faixas do Projeto 1 (verde #19885D), Projeto 2 (azul #127BAF, com *Planejamento original* e *Vigência de referência* em linhas próprias; a hipótese de vigência ganha linha tracejada separada) e Projeto 3 (roxo #8870B5, tracejado; período lido do cenário ativo). Fundo muito claro por período de projeto; onde dois projetos se sobrepõem, o fundo alterna listras finas das duas cores em vez de misturá-las.
2. **Modalidades** — Jornada Tecnológica, Robótica, Cursos Técnicos, Bolsas e Incentivos, Operação e Infraestrutura (e “Outras ações” só quando houver registro sem modalidade). As edições ficam lado a lado nas datas reais; sobreposições ganham uma sub-linha. Bolsas de Inglês formam um grupo próprio dentro de Bolsas. A modalidade é um campo editável (aba Conteúdo) e muda ao arrastar o bloco para outra modalidade — sem alterar datas.
3. **Resumo contextual** — faixa recolhível com a seleção: período, situação, aquisição e o que continua após a vigência.

As visões anteriores continuam em *Exibição*: Somente Projetos, Projetos + Cursos (+ Detalhes) e a matriz V6.

**Régua:** ANO → SEMESTRE → MÊS em qualquer zoom (Zoom: anos, semestres, trimestres, meses, semanas; enquadramentos Histórico, Ciclo atual, Panorama e Personalizado). A posição é calculada pelo dia exato.

**Edição:** clique seleciona; **duplo clique edita o rótulo curto sobre o bloco**; arrastar muda as datas mantendo a duração (vigência documental continua protegida → cenário); bordas mudam início/fim; arrastar na vertical muda modalidade/linha; **botão direito** abre editar rótulo, editar datas, expandir componentes, duplicar, ocultar, bloquear e excluir (com confirmação); desfazer/refazer; encaixe livre/dia/semana/mês.

**Painel em três abas:** *Conteúdo* (nome, rótulo curto, tipo, projeto, modalidade, turma, datas, status), *Design* (fonte, tamanho, peso, cor do texto, preenchimento, contorno, arredondamento, opacidade, 5 estilos predefinidos — gravados em `item.style`, sem tocar datas, status, valores ou vínculos) e *Dados* (aquisição, valores, pagamentos, NF, materiais, bolsas, participação de projetos, fontes).

**Valores sob demanda:** botão *Valores* abre colunas à direita (Contratado · Pago · Saldo) por modalidade e por curso expandido, com totais. Definições: contratado = valores contratados registrados nas aquisições; pago = pagamentos realizados registrados, cada um uma vez; saldo = contratado − pago só quando os dois existem. “—” = não informado. O hover mostra período, turma, projeto, valores, status e fonte.

**Explicar vigência:** botão na barra da timeline (e na Diretoria) abre os Dois Tempos com uma única régua: *Tempo do instrumento* × *Tempo da formação*. O trecho posterior traz “Execução posterior à vigência — situação financeira a verificar”; a aquisição aparece à parte (“registrada como paga · comprovação pendente”; “integralmente paga e comprovada” só com comprovação registrada).

**Projeto 3 — Planejamento Estratégico** (aba *Projeto 3*): quadro com os 4 pilares + dimensão transversal; ideias arrastáveis entre pilares e editáveis (nome, descrição, pilar, prioridade, situação, responsável, período, custo, dependências, fonte, observações). “Adicionar ao cenário do Projeto 3” só para propostas *Validadas internamente*: cria um registro **planejado** apenas no *Cenário B — Estruturação do Projeto 3*, nunca na base. Inclui encaminhamento da ata, validação interna como etapa própria (pendente), comparação Cenário A (prorrogação) × Cenário B, acompanhamento (reunião com a liderança — data e participantes a confirmar —, marcos 09/10, 23/10, 26–27/10 e 30/10 com status editável, prioridades, pendências, próximas ações e responsáveis) e **Modo reunião**. Marcos nunca são concluídos por data.

**Diretoria — cinco cenas:** 1 Evolução dos Projetos · 2 Jornada Educacional (com aba “Cursos técnicos em detalhe”, a antiga cena de compromissos) · 3 Dois Tempos · 4 Decisão de Continuidade (encaminhamento, marcos, decisões, Cenário A × B sobre a base documental) · 5 Futuro do SKA Tech Hub (pilares revelados um a um, a partir do quadro do Projeto 3).

**Dados acrescentados:** as 26 propostas listadas no briefing V11 (todas “Ideia”, sem datas, custos ou responsáveis), os 4 marcos da ata (Previsto), a reunião com a liderança (a confirmar), o Cenário B e a decisão pendente “Validação interna da estruturação do Projeto 3”. O Cenário de prorrogação foi renomeado para “Cenário A — Prorrogação do Projeto 2 (simulação)”. Cores dos projetos atualizadas só onde ainda eram as padrão. Migração idempotente com backup (`ska-temporal-studio:v1:backup-v8`).

**Ainda não feito:** edição de rótulo e estilo para vários blocos de uma vez; arrastar ideias por teclado (há o seletor de pilar); importação de NF/pagamentos em lote; a barra lateral “Elementos” continua organizada por categoria.
