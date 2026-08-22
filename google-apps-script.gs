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

    // A mesma implantação atende dois fluxos: o registro da
    // disponibilidade (sem "acao") e a consulta de rota do dia.
    if (dados.acao === 'consultarRota') {
      return consultarRota(dados);
    }

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
// CONSULTA DE ROTA DO DIA
//
// O motorista informa a placa e a data em que o roteirizador
// registrou a carga (coluna L — "DATA PREENCHEU ROT") e recebe de
// volta a ROTA (K), a ORDEM (J), o motorista (B) e o dia em que a
// rota será executada (coluna M — "DATA_CARREGAMENTO").
//
// Os dados ficam na aba abaixo, na mesma planilha Bd_Cadastro. Se a
// roteirização passar a ser registrada em outra aba, basta trocar
// ABA_ROTAS — as colunas continuam sendo localizadas pelo cabeçalho.
// ============================================================

const ABA_ROTAS = 'Disponibilidade';

// Índices zero-based usados quando o cabeçalho não é localizado pelo
// nome. Layout atual da aba: A PLACA | B MOTORISTA | ... | J ORDEM |
// K ROTA | L DATA PREENCHEU ROT | M DATA_CARREGAMENTO.
const COL_ROTAS_FALLBACK = {
  placa: 0,
  motorista: 1,
  ordem: 9,
  rota: 10,
  dataPreencher: 11,
  dataCarregamento: 12
};

// Quantas datas disponíveis sugerir quando a placa existe mas não tem
// rota na data pedida.
const MAX_SUGESTOES = 5;

function consultarRota(dados) {
  const placa = normalizarPlaca(dados.placaConsulta);

  if (!placa) {
    return respostaJson({
      success: false,
      message: 'Informe a placa do veículo para consultar a rota.'
    });
  }

  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const fuso = planilha.getSpreadsheetTimeZone() || 'America/Sao_Paulo';
  const dataBusca = normalizarDataChave(dados.dataConsulta, fuso);

  if (!dataBusca) {
    return respostaJson({
      success: false,
      message: 'Informe uma data válida para consultar a rota.'
    });
  }

  const aba = planilha.getSheetByName(ABA_ROTAS);

  if (!aba) {
    throw new Error(`Aba "${ABA_ROTAS}" não encontrada na planilha`);
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    return respostaJson({
      success: false,
      message: `A aba "${ABA_ROTAS}" ainda não tem rotas registradas.`
    });
  }

  const col = resolverColunasRota(valores[0]);

  // Duas listas: a busca oficial é pela DATA PREENCHEU ROT (L). Se
  // nada bater, tentamos a DATA_CARREGAMENTO (M) — é comum o motorista
  // digitar o dia em que vai rodar, não o dia em que a carga foi
  // registrada, e devolver a rota certa vale mais que exigir o campo
  // exato. A resposta informa qual data foi usada.
  const porDataPreencher = [];
  const porDataCarregamento = [];
  const datasDaPlaca = {};

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];

    if (normalizarPlaca(linha[col.placa]) !== placa) {
      continue;
    }

    const rota = normalizarTexto(linha[col.rota]);

    // Linhas de disponibilidade ainda sem roteirização não interessam.
    if (!rota) {
      continue;
    }

    const chavePreencher = normalizarDataChave(linha[col.dataPreencher], fuso);
    const chaveCarregamento = normalizarDataChave(
      linha[col.dataCarregamento],
      fuso
    );

    if (chavePreencher) {
      datasDaPlaca[chavePreencher] = true;
    }

    const registro = {
      placa: placa,
      motorista: normalizarTexto(linha[col.motorista]),
      rota: rota,
      ordem: normalizarTexto(linha[col.ordem]),
      dataPreencher: formatarDataBr(chavePreencher),
      dataCarregamento: formatarDataBr(chaveCarregamento),
      linha: i + 1
    };

    if (chavePreencher === dataBusca) {
      porDataPreencher.push(registro);
    } else if (chaveCarregamento === dataBusca) {
      porDataCarregamento.push(registro);
    }
  }

  const dataBuscaBr = formatarDataBr(dataBusca);

  if (porDataPreencher.length) {
    return respostaJson({
      success: true,
      campoBusca: 'DATA PREENCHEU ROT',
      dataConsultada: dataBuscaBr,
      rotas: porDataPreencher
    });
  }

  if (porDataCarregamento.length) {
    return respostaJson({
      success: true,
      campoBusca: 'DATA_CARREGAMENTO',
      dataConsultada: dataBuscaBr,
      rotas: porDataCarregamento
    });
  }

  const sugestoes = Object.keys(datasDaPlaca)
    .sort()
    .reverse()
    .slice(0, MAX_SUGESTOES)
    .map(formatarDataBr);

  if (!sugestoes.length) {
    return respostaJson({
      success: false,
      message: `Nenhuma rota registrada para a placa "${placa}". `
        + `Procure o roteirizador antes de sair para a viagem.`
    });
  }

  return respostaJson({
    success: false,
    message: `A placa "${placa}" não tem rota registrada em ${dataBuscaBr}.`,
    sugestoes: sugestoes
  });
}

// Localiza cada coluna da consulta pelo cabeçalho, com fallback para o
// índice fixo do layout atual.
function resolverColunasRota(cabecalhos) {
  return {
    placa: colunaPorCabecalho(
      cabecalhos, ['PLACA'], COL_ROTAS_FALLBACK.placa
    ),
    motorista: colunaPorCabecalho(
      cabecalhos, ['MOTORISTA'], COL_ROTAS_FALLBACK.motorista
    ),
    ordem: colunaPorCabecalho(
      cabecalhos, ['ORDEM'], COL_ROTAS_FALLBACK.ordem
    ),
    rota: colunaPorCabecalho(
      cabecalhos, ['ROTA'], COL_ROTAS_FALLBACK.rota
    ),
    // O cabeçalho real da coluna L é "DATA PREENCHEU ROT"; as demais
    // grafias ficam como tolerância caso a planilha seja corrigida.
    // Cuidado: a coluna G é "DATA PREENCHEU" (sem o "ROT") — por isso
    // a busca precisa ser pelo nome completo, nunca por "DATA PREENCHEU".
    dataPreencher: colunaPorCabecalho(
      cabecalhos,
      ['DATA PREENCHEU ROT', 'DATA PREENCHER ROT', 'DATA PREENCHER ROTA'],
      COL_ROTAS_FALLBACK.dataPreencher
    ),
    dataCarregamento: colunaPorCabecalho(
      cabecalhos,
      ['DATA CARREGAMENTO'],
      COL_ROTAS_FALLBACK.dataCarregamento
    )
  };
}

// Procura o cabeçalho por igualdade exata antes de tentar "contém":
// "ROTA" e "DATA PREENCHEU ROT" convivem na mesma linha de cabeçalho e
// uma busca solta acabaria pegando a coluna errada.
function colunaPorCabecalho(cabecalhos, nomes, fallback) {
  const alvos = nomes.map(normalizarCabecalho);

  for (let i = 0; i < cabecalhos.length; i++) {
    if (alvos.indexOf(normalizarCabecalho(cabecalhos[i])) !== -1) {
      return i;
    }
  }

  for (let i = 0; i < cabecalhos.length; i++) {
    const atual = normalizarCabecalho(cabecalhos[i]);

    for (let j = 0; j < alvos.length; j++) {
      if (atual && atual.indexOf(alvos[j]) !== -1) {
        return i;
      }
    }
  }

  return fallback;
}

// Cabeçalho comparado sem acento, sem underscore e sem espaços
// repetidos: "DATA_CARREGAMENTO", "Data Carregamento" e
// "DATA CARREGAMENTO " viram a mesma chave.
function normalizarCabecalho(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Converte para a chave "yyyy-MM-dd", que é como as datas são
// comparadas. Aceita o que a planilha devolve (Date ou número de série)
// e o que vem do formulário ou de células de texto ("2026-08-22",
// "22/08/2026", "22/08/26"). Retorna '' quando não é uma data.
function normalizarDataChave(valor, fuso) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, fuso || 'America/Sao_Paulo', 'yyyy-MM-dd');
  }

  if (typeof valor === 'number' && isFinite(valor) && valor > 0) {
    const base = new Date(Date.UTC(1899, 11, 30));
    const data = new Date(base.getTime() + Math.round(valor) * 86400000);

    return Utilities.formatDate(data, 'UTC', 'yyyy-MM-dd');
  }

  const texto = String(valor || '').trim();

  if (!texto) {
    return '';
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const br = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);

  if (br) {
    const dia = ('0' + br[1]).slice(-2);
    const mes = ('0' + br[2]).slice(-2);
    const ano = br[3].length === 2 ? '20' + br[3] : br[3];

    return `${ano}-${mes}-${dia}`;
  }

  return '';
}

// "2026-08-22" -> "22/08/2026". Feito por string para não reintroduzir
// deslocamento de fuso em uma data já normalizada.
function formatarDataBr(chave) {
  if (!chave) {
    return '';
  }

  const partes = chave.split('-');

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
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
    versao: '2.1 - Validação tolerante de placa e carga + consulta de rota'
  });
}
