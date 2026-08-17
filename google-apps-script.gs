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
  const placa = normalizarTexto(dados.placaVeiculo);

  if (!placa) {
    return 'Informe a placa do veículo.';
  }

  if (!placaCadastrada(placa)) {
    return 'Motorista não está cadastrado. A placa informada não consta em Bd_Cadastros.';
  }

  const codCarga = normalizarTexto(dados.codUltimaCarga);

  if (!codCarga) {
    return 'Informe o código da última carga.';
  }

  if (!cargaFinalizada(codCarga)) {
    return 'O motorista ainda tem cargas para finalizar.';
  }

  return null;
}

// Procura a placa (coluna cujo cabeçalho contém "PLACA") na aba
// Bd_Cadastros. Retorna true se encontrada.
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
  const colPlaca = encontrarColuna(cabecalhos, 'PLACA');

  if (colPlaca === -1) {
    throw new Error(`Coluna de PLACA não encontrada em "${ABA_CADASTROS}"`);
  }

  for (let i = 1; i < valores.length; i++) {
    if (normalizarTexto(valores[i][colPlaca]) === placaNormalizada) {
      return true;
    }
  }

  return false;
}

// Procura o código na coluna "Carga Limpa" (F) da aba
// Cargas_Finalizadas e verifica se a linha correspondente tem a
// "Data Fim Viagem" (E) preenchida.
function cargaFinalizada(codCargaNormalizado) {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const aba = planilha.getSheetByName(ABA_CARGAS_FINALIZADAS);

  if (!aba) {
    throw new Error(`Aba "${ABA_CARGAS_FINALIZADAS}" não encontrada na planilha`);
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    return false;
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

  for (let i = 1; i < valores.length; i++) {
    if (normalizarTexto(valores[i][colCarga]) === codCargaNormalizado) {
      const dataFim = valores[i][colDataFim];
      return dataFim !== '' && dataFim !== null;
    }
  }

  return false;
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
    normalizarTexto(dados.placaVeiculo),
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
// TESTE DE ACESSO VIA GET (retorna status ao abrir a URL)
// ============================================================

function doGet() {
  return respostaJson({
    status: 'OK',
    message: 'Script funcionando corretamente',
    versao: '1.1'
  });
}
