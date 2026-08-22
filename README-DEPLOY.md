# GOLOG - Disponibilidade de Frota

## Visão Geral

Formulário web, sem login, para o motorista ou responsável informar a
disponibilidade atual do veículo. Layout corporativo próprio (sem
gradientes, sem ícones/emoji), mantendo a paleta institucional do
LogFlow (roxo + verde).

### Campos do formulário

- **PLACA** — mesma máscara/validação do Cadflow (formato antigo
  AAA0000 ou Mercosul AAA0A00). Precisa estar cadastrada em
  `Bd_Cadastros`.
- **MOTORISTA** — nome, texto livre obrigatório.
- **COD DA ULTIMA CARGA** — obrigatório. Precisa constar como
  finalizada em `Cargas_Finalizadas`.
- **STATUS** — seleção: DISPONÍVEL, EM MANUTENÇÃO, INDISPONÍVEL, OCUPADO.
- **MODELO** — seleção: VAN, TIPO 3/4, FIORINO, TOCO, TRUCK (mesmas
  opções do Cadflow).
- **OPERAÇÃO** — seleção: CONGELADO, REFRIGERADO, SECO (mesmas opções
  do Cadflow).
- **DATA PREENCHIMENTO** — carimbo de data/hora, gerado automaticamente
  no envio (não é digitado pelo usuário).

---

## Conexão com a planilha (mesma arquitetura do LogFlow)

O LogFlow (`SiteDash/Site.py`) conecta no Google Sheets assim: uma
conta de serviço Google autentica no servidor (Python + `gspread`) e
abre a planilha **"Bd_Cadastro"** por ID (`conectar_bd_cadastro()`),
lendo e gravando as abas por nome. O navegador do usuário nunca toca a
planilha diretamente.

O GOLOG (e o Cadflow) seguem a mesma lógica, só que o "servidor" é o
próprio Google Apps Script: `SpreadsheetApp.openById(PLANILHA_ID)` abre
a mesma planilha central, e o formulário só conversa com esse script
via `fetch` POST — nunca com a planilha diretamente.

```text
Navegador (form) → fetch POST → Apps Script → SpreadsheetApp.openById(PLANILHA_ID)
```

O ID já está preenchido em `google-apps-script.gs`
(`PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ'`), o
mesmo `BD_CADASTRO_URL` usado pelo LogFlow.

---

## Validações no envio

Antes de gravar a linha, o `doPost` do Apps Script roda duas
verificações, lendo abas da própria planilha `Bd_Cadastro`:

1. **Placa cadastrada.** Procura a PLACA informada na **coluna I**
   (fixa, não por nome de cabeçalho) da aba `Bd_Cadastros`. Se não
   encontrar, devolve o erro *"Placa não cadastrada: '...' não consta
   na coluna PLACA da aba 'Bd_Cadastros'. Cadastre o veículo no
   Cadflow antes de informar a disponibilidade."* e não grava nada.
2. **Carga finalizada.** Procura o COD DA ULTIMA CARGA na aba
   `Cargas_Finalizadas`, coluna **F "Carga Limpa"**. Se não encontrar
   a linha, ou se a coluna **E "Data Fim Viagem"** estiver vazia,
   devolve o erro *"Carga não finalizada: o código '...' não consta
   com Data Fim Viagem preenchida na aba 'Cargas_Finalizadas'. O
   motorista ainda tem carga em aberto."* e não grava nada.

As duas mensagens de erro sempre citam o valor exato que falhou (a
placa ou o código da carga), para deixar claro qual das duas
validações barrou o envio.

Essas duas validações valem **só para o GOLOG** — o Cadflow (que é o
formulário que cria o cadastro em `Bd_Cadastros`) não passa por elas.

---

## Consulta de Rota do Dia

Abaixo do formulário de disponibilidade, a página tem a seção
**"Consultar Rota do Dia"**: o motorista informa a **placa** e a
**data da rota** e recebe a rota, a ordem de prioridade, o motorista
e o dia de carregamento.

A consulta usa **a mesma implantação** do Apps Script — o que separa
os dois fluxos no `doPost` é o parâmetro `acao=consultarRota`. Não há
segunda planilha, segundo script nem segunda URL.

### Colunas lidas

A leitura é feita na aba `Disponibilidade` (constante `ABA_ROTAS`), a
mesma que recebe os envios do formulário:

| Coluna | Cabeçalho | Papel na consulta |
|---|---|---|
| A | PLACA | filtro — placa informada pelo motorista |
| B | MOTORISTA | devolvido no resultado |
| J | ORDEM | devolvido (1 prioridade, 2 média, 3 baixa) |
| K | ROTA | **resposta principal** |
| L | DATA PREENCHEU ROT | filtro — data digitada pelo motorista |
| M | DATA_CARREGAMENTO | devolvido — dia em que a rota será rodada |

As colunas são localizadas **pelo cabeçalho** (sem acento, sem
underscore, ignorando maiúsculas), com os índices acima apenas como
fallback. Reordenar ou renomear levemente as colunas na planilha não
quebra a consulta. Se a roteirização passar a ser registrada em outra
aba, basta trocar a constante `ABA_ROTAS` no `.gs`.

### Comportamento da busca

1. Filtra as linhas da placa informada que já tenham **ROTA**
   preenchida (linhas de disponibilidade ainda sem roteirização são
   ignoradas).
2. Casa a data digitada com a **DATA PREENCHEU ROT** (coluna L).
3. Se nada bater, tenta a **DATA_CARREGAMENTO** (coluna M) — é comum
   o motorista digitar o dia em que vai rodar, e não o dia em que a
   carga foi registrada. Nesse caso o rodapé do cartão avisa qual data
   foi usada.
4. Se a placa tem rotas, mas nenhuma na data pedida, a mensagem traz
   até 5 **datas disponíveis** como botões — um clique já refaz a
   consulta naquela data.
5. Se a placa não tem nenhuma rota registrada, a mensagem orienta a
   procurar o roteirizador.

Datas são comparadas normalizadas em `yyyy-MM-dd`, aceitando o que a
planilha devolver: `Date`, número de série do Sheets ou texto
(`22/08/2026`, `22/08/26`, `2026-08-22`), sempre no fuso da planilha.

A consulta é **somente leitura** — nenhuma linha é gravada ou alterada.

---

## Configuração do Google Apps Script

### Passo 1: Planilha e aba de destino

Este formulário grava na planilha **"Bd_Cadastro"**, aba
**"Disponibilidade"**, que já existe com os cabeçalhos das colunas A a M.

O formulário preenche as colunas **A a G**:

| Coluna | Cabeçalho | Origem |
|---|---|---|
| A | PLACA | campo Placa |
| B | MOTORISTA | campo Motorista |
| C | STATUS | campo Status |
| D | MODELO | campo Modelo |
| E | OPERAÇÃO | campo Operação |
| F | COD DA ULTIMA CARGA | campo Cod da Última Carga |
| G | DATA PREENCHEU | carimbo automático no envio |

As colunas H em diante (UTILIZAÇÃO, SEGMENTO, ORDEM, ROTA, DATA
PREENCHEU ROT, DATA_CARREGAMENTO) já existem na planilha e continuam
sendo preenchidas por outro processo — este script **nunca grava**
nelas, apenas **lê** J, K, L e M na Consulta de Rota do Dia.

### Passo 2: Criar o Google Apps Script

1. Acesse [script.google.com](https://script.google.com).
2. Clique em **"Novo projeto"**.
3. Cole o conteúdo do arquivo `google-apps-script.gs`. O `PLANILHA_ID`
   já vem preenchido com o ID real da planilha `Bd_Cadastro`; só troque
   se estiver apontando para outra cópia da planilha.
4. Renomeie o projeto para **"Disponibilidade Frota GOLOG"**.

### Passo 3: Testar a configuração

1. Selecione a função `testarConfiguracao` no editor.
2. Clique em **"Executar"** e autorize o script quando solicitado.
3. Verifique os logs em **"Ver" > "Registros"** — deve confirmar que
   as três abas (`Disponibilidade`, `Bd_Cadastros`,
   `Cargas_Finalizadas`) foram encontradas.

### Passo 4: Implantar como Web App

1. Clique em **"Implantar" > "Nova implantação"**.
2. Ícone de engrenagem > **"Aplicativo da Web"**.
3. Configure:
   - **Executar como:** "Eu", seu email.
   - **Quem tem acesso:** "Qualquer pessoa".
4. Clique em **"Implantar"** e copie a URL gerada (termina em `/exec`).

### Republicar sempre que o `.gs` mudar

Salvar o código no editor **não** atualiza a URL `/exec` — o Web App
serve a última *versão implantada*. Depois de colar uma nova versão de
`google-apps-script.gs`, vá em "Implantar" > "Gerenciar implantações" >
lápis > **Versão: "Nova versão"** > "Implantar".

Abrir a URL `/exec` no navegador mostra a versão no ar (campo `versao`
do `doGet`). O código atual desta pasta é a versão
`2.1 - Validação tolerante de placa e carga + consulta de rota`.

Se a Consulta de Rota responder *"O servidor respondeu 200 sem JSON"*
ou continuar dizendo que a placa não tem rota, o sintoma quase sempre é
esse: a implantação no ar ainda é a versão anterior, sem o
`acao === 'consultarRota'` no `doPost`. Republique.

---

## Configuração do Frontend

Abra `disponibilidade-frota.js` e substitua:

```javascript
const APPS_SCRIPT_URL = 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI';
```

pela URL copiada no passo anterior. Enquanto essa constante ficar com
o texto de exemplo, **todo envio falha**: o `fetch` vai para uma URL
relativa do próprio site, recebe um 404 em HTML e o formulário mostra
"Erro ao enviar a disponibilidade" mesmo com placa e carga válidas.
Depois de trocar a URL, faça commit e push — a Vercel republica o
site com o arquivo novo.

---

## Deploy na Vercel

Mesmo processo do Cadflow: importe a pasta `GOLOG` como projeto na
Vercel com **Framework Preset: Other**, sem build command nem output
directory.

---

## Estrutura dos Arquivos

```text
GOLOG/
├── disponibilidade-frota.html   # Formulário + Consulta de Rota do Dia
├── disponibilidade-frota.css    # Layout corporativo, sem gradiente/emoji
├── disponibilidade-frota.js     # Validações, máscara, envio e consulta
├── google-apps-script.gs        # Backend: gravação, validações e consulta
└── README-DEPLOY.md             # Este arquivo
```
