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
