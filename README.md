# Agenda da Família

Agenda compartilhada do casal, com a identidade visual da AR Consultoria (marinho `#17397d`, azul `#005ea4`,
ciano `#20b8d5`, azul-claro `#b3d8eb`, fonte Montserrat). É um aplicativo web **instalável no celular** (PWA):
abre em tela cheia pelo ícone, como o Vértice.

Mesma base do sistema da AR: Node.js + SQLite nativo (`node:sqlite`), HTML/CSS/JS puro, sem build.

## O que tem

- **Calendário do mês** com os compromissos de cada dia. Cada pessoa tem a sua cor:
  azul (primeira pessoa), ciano (segunda) e azul + ciano para os compromissos **juntos**.
  No celular os dias mostram bolinhas; toque no dia para ver a lista.
- **Painel do dia** e **próximos 14 dias**.
- **Compromissos**: o que é, data, início e fim (ou dia inteiro), de quem é, onde, observações e
  repetição (toda semana, todo mês, todo ano).
- **Vários dias** (praia, férias, viagem): preencha "Até" com o último dia. No calendário vira uma faixa contínua
  de um dia ao outro (no celular, uma barra abaixo dos números); no painel aparece "dia 2 de 3" e o período (20/11 a 22/11).
  O horário de início vale para o primeiro dia e o de fim para o último.
- **Filtro** por pessoa (os compromissos "juntos" aparecem nos dois).
- **Duas contas** (uma para cada um). O que um marca, o outro vê: o app atualiza ao voltar para ele e a cada minuto.
- **Ajustes** (ícone de pessoa): nomes que aparecem na agenda, trocar a própria senha e sair.
- **Sem internet**: o app abre e mostra a última versão salva no aparelho (para salvar, precisa de conexão).
- O login fica guardado no celular por 180 dias.

## Colocar na tela do celular

1. Abra o endereço publicado no navegador do celular e entre com o seu usuário.
2. **Android (Chrome)**: toque em **Instalar** no aviso que aparece no topo da agenda
   (ou menu ⋮ → *Instalar app* / *Adicionar à tela inicial*).
3. **iPhone (Safari)**: toque em **Compartilhar** → **Adicionar à Tela de Início**.

O ícone "Agenda" aparece na tela inicial e abre em tela cheia.

## Publicar no Render

1. render.com → **New → Blueprint** → escolha este repositório (usa o `render.yaml`).
2. Preencha as variáveis das duas contas:

| Variável | Para quê | Exemplo |
|---|---|---|
| `LOGIN_1`, `NOME_1`, `SENHA_1` | primeira pessoa (cor azul) | `augusto` / `Augusto` / senha |
| `LOGIN_2`, `NOME_2`, `SENHA_2` | segunda pessoa (cor ciano) | login, nome e senha dela |

As contas são criadas no primeiro início; depois disso as senhas se trocam pelo app (Ajustes) e os nomes também.
`SESSION_SECRET` é gerada pelo Render. Os dados ficam no disco persistente (`/var/data/agenda.db`).

O endereço `/healthz` responde `ok`; dá para cadastrar a agenda na **Central de sistemas** da AR.

Também roda em Docker (`Dockerfile`, dados em `/data`).

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm test
```

Sem as variáveis, as contas de teste são `marido` e `esposa`, ambas com a senha `agenda123`
(o app pede para trocar). Em produção (`NODE_ENV=production`) `SENHA_1` e `SENHA_2` são obrigatórias.

## Estrutura

- `server.js`: login, sessão, API de compromissos (`/api/eventos`), nomes e senha.
- `db.js`: banco SQLite (`usuarios`, `eventos`).
- `public/index.html`, `public/css/app.css`, `public/js/app.js`: a interface.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`: o que torna o app instalável.
- `test/api.test.js`: testes da API (`npm test`).
