// ============================================================
// DISPONIBILIDADE DE FROTA - GOLOG
// Backend em Google Apps Script
//
// Conexão: mesma arquitetura usada pelo LogFlow (SiteDash/Site.py) —
// uma única planilha central "Bd_Cadastro", aberta pelo ID a partir
// do servidor (aqui, o próprio Apps Script; lá, uma conta de serviço
// Google com gspread). O navegador nunca acessa a planilha diretamente,
// só troca dados com este script via POST.
// ============================================================

// ID da planilha "Bd_Cadastro" (mesma usada pelo LogFlow / Cadflow).
const PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ';

const ABA_DISPONIBILIDADE = 'Disponibilidade';
const ABA_CADASTROS = 'Bd_Cadastros';
const ABA_CARGAS_FINALIZADAS = 'Cargas_Finalizadas';

// Cabeçalhos das colunas A a G da aba Disponibilidade, na ordem em
// que o formulário escreve. As colunas H em diante (UTILIZAÇÃO,
// SEGMENTO, ORDEM, ROTA, etc.) já existem na planilha e não são
// tocadas por este script.
const COLUNAS = [
  'PLACA',
  'MOTORISTA',
  'STATUS',
  'MODELO',
  'OPERAÇÃO',
  'COD DA ULTIMA CARGA',
  'DATA PREENCHEU'
];

// ============================================================
// RECEBER ENVIO DO FORMULÁRIO
// ============================================================

function doPost(e) {
  try {
    const dados = e.parameter;

    const erroValidacao = validarDisponibilidade(dados);

    if (erroValidacao) {
      return respostaJson({ success: false, message: erroValidacao });
    }

    const planilha = SpreadsheetApp.openById(PLANILHA_ID);
    const aba = planilha.getSheetByName(ABA_DISPONIBILIDADE);

    if (!aba) {
      throw new Error(`Aba "${ABA_DISPONIBILIDADE}" não encontrada na planilha`);
    }

    garantirCabecalho(aba);

    aba.appendRow(prepararLinha(dados));

    return respostaJson({ success: true });
  } catch (erro) {
    return respostaJson({ success: false, message: erro.message });
  }
}

// ============================================================
// VALIDAÇÕES
// - Placa precisa constar em Bd_Cadastro → Bd_Cadastros.
// - Código da última carga precisa constar em Bd_Cadastro →
//   Cargas_Finalizadas, com a Data Fim Viagem preenchida.
// ============================================================

function validarDisponibilidade(dados) {
  const placa = normalizarPlaca(dados.placaVeiculo);

  if (!placa) {
    return 'Informe a placa do veículo.';
  }

  if (!placaCadastrada(placa)) {
    return `Veiculo sem Cadastro: a placa "${placa}" não consta na coluna `
      + `"PLACA do Veiculo" da aba "${ABA_CADASTROS}". Cadastre o veículo `
      + `no Cadflow antes de informar a disponibilidade.`;
  }

  const codCarga = normalizarCarga(dados.codUltimaCarga);

  if (!codCarga) {
    return 'Informe o código da última carga.';
  }

  const situacaoCarga = situacaoDaCarga(codCarga);

  if (situacaoCarga === 'NAO_ENCONTRADA') {
    return `Ultima carga não encontrada: o código "${codCarga}" não consta `
      + `na aba "${ABA_CARGAS_FINALIZADAS}".`;
  }

  if (situacaoCarga === 'SEM_DATA_FIM') {
    return `Ultima carga não finalizada: o código "${codCarga}" está na aba `
      + `"${ABA_CARGAS_FINALIZADAS}" sem a Data Fim Viagem preenchida. `
      + `O motorista ainda tem carga em aberto.`;
  }

  return null;
}

// Coluna I (índice 8, zero-based) da aba Bd_Cadastros — "PLACA do
// Veiculo". Usado como fallback caso o cabeçalho não seja encontrado
// pelo nome (por exemplo, se a coluna for renomeada ou reordenada).
const COL_PLACA_CADASTROS = 8;

// Procura a placa na coluna "PLACA do Veiculo" da aba Bd_Cadastros
// (por nome de cabeçalho, com fallback para a coluna I). Retorna true
// se encontrada.
function placaCadastrada(placaNormalizada) {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const aba = planilha.getSheetByName(ABA_CADASTROS);

  if (!aba) {
    throw new Error(`Aba "${ABA_CADASTROS}" não encontrada na planilha`);
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    return false;
  }

  const cabecalhos = valores[0];
  let colPlaca = encontrarColuna(cabecalhos, 'PLACA do Veiculo');

  if (colPlaca === -1) {
    colPlaca = COL_PLACA_CADASTROS;
  }

  for (let i = 1; i < valores.length; i++) {
    if (normalizarPlaca(valores[i][colPlaca]) === placaNormalizada) {
      return true;
    }
  }

  return false;
}

// Procura o código na coluna "Carga Limpa" (F) da aba
// Cargas_Finalizadas e informa a situação encontrada:
//   'FINALIZADA'     - carga na aba com "Data Fim Viagem" (E) preenchida
//   'SEM_DATA_FIM'   - carga na aba, mas sem data de fim
//   'NAO_ENCONTRADA' - código ausente da aba
function situacaoDaCarga(codCargaNormalizado) {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const aba = planilha.getSheetByName(ABA_CARGAS_FINALIZADAS);

  if (!aba) {
    throw new Error(`Aba "${ABA_CARGAS_FINALIZADAS}" não encontrada na planilha`);
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    return 'NAO_ENCONTRADA';
  }

  const cabecalhos = valores[0];
  let colCarga = encontrarColuna(cabecalhos, 'Carga Limpa');
  let colDataFim = encontrarColuna(cabecalhos, 'Data Fim Viagem');

  // Fallback para as colunas F (índice 5) e E (índice 4) caso os
  // cabeçalhos tenham sido renomeados na planilha.
  if (colCarga === -1) {
    colCarga = 5;
  }

  if (colDataFim === -1) {
    colDataFim = 4;
  }

  let encontrada = false;

  for (let i = 1; i < valores.length; i++) {
    if (normalizarCarga(valores[i][colCarga]) !== codCargaNormalizado) {
      continue;
    }

    encontrada = true;

    const dataFim = valores[i][colDataFim];

    // A célula pode trazer um Date, um número de série ou texto; só
    // interessa se tem algum conteúdo. Uma linha repetida sem data não
    // invalida outra linha da mesma carga já finalizada.
    if (dataFim instanceof Date || String(dataFim || '').trim() !== '') {
      return 'FINALIZADA';
    }
  }

  return encontrada ? 'SEM_DATA_FIM' : 'NAO_ENCONTRADA';
}

// Procura, entre os cabeçalhos, a primeira coluna cujo nome contém
// o termo informado (comparação sem acento, maiúsculas, aparada).
function encontrarColuna(cabecalhos, termo) {
  const alvo = normalizarTexto(termo);

  for (let i = 0; i < cabecalhos.length; i++) {
    if (normalizarTexto(cabecalhos[i]).indexOf(alvo) !== -1) {
      return i;
    }
  }

  return -1;
}

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase();
}

// Placa comparada só por letras e números: assim "RHZ-2A82",
// "rhz2a82" e "RHZ2A82 " batem com o mesmo cadastro.
function normalizarPlaca(valor) {
  return normalizarTexto(valor).replace(/[^A-Z0-9]/g, '');
}

// Código de carga comparado no mesmo formato produzido pelo
// LIMPARCARGA: sem o prefixo "NNN-" da origem e sem o que vier depois
// da vírgula.
function normalizarCarga(valor) {
  let texto = normalizarTexto(valor);

  if (texto.indexOf(',') !== -1) {
    texto = texto.split(',')[0];
  }

  texto = texto.replace(/^\d+-/, '');

  return texto.trim();
}

// ============================================================
// GARANTIR CABEÇALHO (cria apenas se a linha 1 estiver vazia)
// ============================================================

function garantirCabecalho(aba) {
  const primeiraLinha = aba.getRange(1, 1, 1, COLUNAS.length).getValues()[0];
  const temCabecalho = primeiraLinha.some(valor => valor !== '');

  if (!temCabecalho) {
    aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]);
  }
}

// ============================================================
// MONTAR LINHA NA ORDEM DAS COLUNAS A-G
// ============================================================

function prepararLinha(dados) {
  return [
    normalizarPlaca(dados.placaVeiculo),
    dados.nomeMotorista || '',
    dados.status || '',
    dados.modeloVeiculo || '',
    dados.operacao || '',
    dados.codUltimaCarga || '',
    dados.carimboDataHora || ''
  ];
}

// ============================================================
// RESPOSTA JSON
// ============================================================

function respostaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TESTE DE CONFIGURAÇÃO
// ============================================================

function testarConfiguracao() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);

  [ABA_DISPONIBILIDADE, ABA_CADASTROS, ABA_CARGAS_FINALIZADAS].forEach(nome => {
    const aba = planilha.getSheetByName(nome);

    if (!aba) {
      Logger.log(`ERRO: aba "${nome}" não encontrada`);
      return;
    }

    Logger.log(`OK: aba "${nome}" encontrada (${aba.getLastRow()} linhas)`);
  });

  const abaDisp = planilha.getSheetByName(ABA_DISPONIBILIDADE);

  if (abaDisp) {
    garantirCabecalho(abaDisp);
  }

  Logger.log('Configuração verificada.');
}

// ============================================================
// DIAGNÓSTICO DE UMA VALIDAÇÃO
//
// Troque os valores abaixo e rode pelo editor (Executar) para ver, no
// Registro de execução, exatamente por que uma disponibilidade foi
// recusada — sem precisar reenviar o formulário.
// ============================================================

function testarValidacao() {
  const placa = 'RHZ2A82';
  const carga = '458004';

  Logger.log(`Placa "${normalizarPlaca(placa)}" cadastrada: `
    + placaCadastrada(normalizarPlaca(placa)));

  Logger.log(`Carga "${normalizarCarga(carga)}": `
    + situacaoDaCarga(normalizarCarga(carga)));
}

// ============================================================
// TESTE DE ACESSO VIA GET (retorna status ao abrir a URL)
// ============================================================

function doGet() {
  return respostaJson({
    status: 'OK',
    message: 'Script funcionando corretamente',
    versao: '2.0 - Validação tolerante de placa e carga'
  });
}
