// ============================================================
// DISPONIBILIDADE DE FROTA - GOLOG
// JavaScript para validações, máscaras e envio
// ============================================================

// URL da implantação do Apps Script (Implantar -> Nova implantação ->
// App da Web). Precisa ser absoluta e terminar em /exec: com o texto de
// exemplo que ficava aqui antes, o fetch caía em uma URL relativa do
// próprio site, recebia um 404 em HTML e o formulário mostrava o erro
// genérico de envio mesmo com placa e carga corretas.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwUxhP1bL90CDyCDu9xETZGpkoTfQe-u0h3CouS1BlTGI27WEyzr6xZm371QUxVPus/exec';

function urlConfigurada() {
  return APPS_SCRIPT_URL.indexOf('https://') === 0
    && APPS_SCRIPT_URL.indexOf('/exec') !== -1;
}

// ============================================================
// MÁSCARAS E VALIDAÇÕES
// ============================================================

// Validar placa (formato antigo ou Mercosul)
function validarPlaca(placa) {
  placa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  // Formato antigo: AAA0000
  const regexAntigo = /^[A-Z]{3}[0-9]{4}$/;

  // Formato Mercosul: AAA0A00
  const regexMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  return regexAntigo.test(placa) || regexMercosul.test(placa);
}

// ============================================================
// APLICAR MÁSCARAS NOS INPUTS
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('disponibilidadeForm');

  // Placa: letras maiúsculas e números
  const placaInput = document.getElementById('placaVeiculo');

  placaInput.addEventListener('input', function (e) {
    e.target.value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  });

  placaInput.addEventListener('blur', function (e) {
    validarCampo(
      e.target,
      validarPlaca,
      'Placa inválida. Use AAA0000 ou AAA0A00'
    );
  });

  // Selects: feedback visual ao escolher
  const selects = document.querySelectorAll('.form-group select');

  selects.forEach(select => {
    select.addEventListener('change', function (e) {
      e.target.classList.toggle('valid', Boolean(e.target.value));
      e.target.classList.remove('invalid');
    });
  });

  // Envio do formulário
  form.addEventListener('submit', handleSubmit);

  // ── Consulta de rota do dia ──
  const consultaForm = document.getElementById('consultaRotaForm');
  const placaConsulta = document.getElementById('placaConsulta');
  const dataConsulta = document.getElementById('dataConsulta');

  placaConsulta.addEventListener('input', function (e) {
    e.target.value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  });

  placaConsulta.addEventListener('blur', function (e) {
    validarCampo(
      e.target,
      validarPlaca,
      'Placa inválida. Use AAA0000 ou AAA0A00'
    );
  });

  // Começa no dia de hoje: é a consulta mais provável do motorista.
  dataConsulta.value = dataDeHoje();

  consultaForm.addEventListener('submit', handleConsultaRota);
});

// Data local no formato yyyy-MM-dd aceito pelo input[type="date"].
// Montada a partir dos componentes locais — toISOString() converte
// para UTC e, no fuso do Brasil, devolve o dia anterior à noite.
function dataDeHoje() {
  const agora = new Date();

  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');

  return `${agora.getFullYear()}-${mes}-${dia}`;
}

// ============================================================
// VALIDAÇÃO DE CAMPO INDIVIDUAL
// ============================================================

function validarCampo(input, validador, mensagemErro) {
  const valor = input.value;
  const formGroup = input.closest('.form-group');

  // Remove mensagem de erro anterior
  let errorMsg = formGroup.querySelector('.error-message');

  if (errorMsg) {
    errorMsg.remove();
  }

  formGroup.classList.remove('has-error');
  input.classList.remove('invalid', 'valid');

  if (!valor) {
    return;
  }

  if (validador(valor)) {
    input.classList.add('valid');
  } else {
    input.classList.add('invalid');
    formGroup.classList.add('has-error');

    errorMsg = document.createElement('span');
    errorMsg.className = 'error-message';
    errorMsg.textContent = mensagemErro;

    formGroup.appendChild(errorMsg);
  }
}

// ============================================================
// ENVIO DO FORMULÁRIO
// ============================================================

async function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnLoader = btnSubmit.querySelector('.btn-loader');
  const messageBox = document.getElementById('messageBox');

  // Validar todos os campos
  let valido = true;
  const erros = [];

  // Validar placa
  const placa = document.getElementById('placaVeiculo').value;

  if (!validarPlaca(placa)) {
    erros.push('Placa do veículo inválida. Use AAA0000 ou AAA0A00');
    valido = false;
  }

  // Validar motorista
  const motorista = document.getElementById('nomeMotorista').value;

  if (!motorista.trim()) {
    erros.push('Preencha o campo "Motorista"');
    valido = false;
  }

  // Validar código da última carga
  const codUltimaCarga = document.getElementById('codUltimaCarga').value;

  if (!codUltimaCarga.trim()) {
    erros.push('Preencha o campo "COD DA ULTIMA CARGA"');
    valido = false;
  }

  // Validar campos de seleção
  const selecoes = [
    ['status', 'Selecione o STATUS'],
    ['modeloVeiculo', 'Selecione o Modelo do Veículo'],
    ['operacao', 'Selecione a OPERAÇÃO']
  ];

  for (const [id, mensagem] of selecoes) {
    const select = document.getElementById(id);

    if (!select.value) {
      select.classList.add('invalid');
      erros.push(mensagem);
      valido = false;
    }
  }

  if (!valido) {
    mostrarMensagem(
      'error',
      'Erros no formulário:<br>' + erros.join('<br>')
    );

    return;
  }

  if (!urlConfigurada()) {
    mostrarMensagem(
      'error',
      'O formulário ainda não está ligado ao Apps Script: a constante ' +
      'APPS_SCRIPT_URL em disponibilidade-frota.js continua com a URL de ' +
      'exemplo. Publique o script como App da Web e cole aqui a URL /exec.'
    );

    return;
  }

  // Desabilitar botão e mostrar carregamento
  btnSubmit.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';
  messageBox.style.display = 'none';

  try {
    // Preparar FormData
    const formData = new FormData(form);

    // Adicionar carimbo de data/hora
    const agora = new Date();

    const dataHora = agora.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    formData.append('carimboDataHora', dataHora);

    // Enviar para o Google Apps Script
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: formData
    });

    // O Apps Script responde JSON. Qualquer outra coisa (página de erro
    // do Google, tela de login, 404 do próprio site) vira uma mensagem
    // explicando o que veio, em vez do erro genérico de envio.
    const corpo = await response.text();
    let result;

    try {
      result = JSON.parse(corpo);
    } catch (erroParse) {
      throw new Error(
        `O servidor respondeu ${response.status} sem JSON. Confira se a URL ` +
        'do Apps Script é a de implantação (/exec) e se o acesso está como ' +
        '"Qualquer pessoa".'
      );
    }

    if (result.success) {
      mostrarMensagem(
        'success',
        'Disponibilidade enviada com sucesso.'
      );

      form.reset();

      // Limpar estados de validação
      form.querySelectorAll('.valid, .invalid').forEach(campo => {
        campo.classList.remove('valid', 'invalid');
      });

      form.querySelectorAll('.has-error').forEach(grupo => {
        grupo.classList.remove('has-error');
      });

      form.querySelectorAll('.error-message').forEach(msg => msg.remove());

      // Rolar para o topo
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      // Falha de validação do servidor (placa não cadastrada, carga em
      // aberto etc.) — mostra a mensagem exata devolvida pelo backend.
      mostrarMensagem(
        'error',
        result.message || 'Não foi possível enviar a disponibilidade.'
      );
    }
  } catch (error) {
    console.error('Erro:', error);

    mostrarMensagem(
      'error',
      (error && error.message ? error.message + ' ' : '') +
      'Erro ao enviar a disponibilidade. Por favor, tente novamente. ' +
      'Se o problema persistir, entre em contato conosco.'
    );
  } finally {
    // Reabilitar botão
    btnSubmit.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

// ============================================================
// EXIBIR MENSAGEM
// ============================================================

function mostrarMensagem(tipo, mensagem) {
  mostrarMensagemEm('messageBox', tipo, mensagem);
}

function mostrarMensagemEm(caixaId, tipo, mensagem) {
  const messageBox = document.getElementById(caixaId);
  const rotulo = tipo === 'success' ? 'Sucesso' : 'Erro';

  messageBox.className = `message-box ${tipo}`;
  messageBox.innerHTML =
    `<span class="tag">${rotulo}</span>${mensagem}`;
  messageBox.style.display = 'block';

  // Rolar para a mensagem
  messageBox.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });

  // Ocultar após 8 segundos, apenas para sucesso
  if (tipo === 'success') {
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 8000);
  }
}

// ============================================================
// CONSULTA DE ROTA DO DIA
//
// Usa a mesma implantação do Apps Script do formulário; o parâmetro
// "acao=consultarRota" é o que separa os dois fluxos no doPost.
// ============================================================

// Coluna ORDEM da planilha: 1 é o que sai primeiro.
const ORDEM_ROTULOS = {
  '1': 'Prioridade',
  '2': 'Média prioridade',
  '3': 'Baixa prioridade'
};

async function handleConsultaRota(e) {
  e.preventDefault();

  const btn = document.getElementById('btnConsultarRota');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  const caixaMensagem = document.getElementById('rotaMessageBox');
  const caixaResultado = document.getElementById('rotaResultado');

  const placa = document.getElementById('placaConsulta').value;
  const data = document.getElementById('dataConsulta').value;

  caixaMensagem.style.display = 'none';
  caixaResultado.style.display = 'none';
  caixaResultado.innerHTML = '';

  if (!validarPlaca(placa)) {
    mostrarMensagemEm(
      'rotaMessageBox',
      'error',
      'Placa inválida. Use AAA0000 ou AAA0A00.'
    );

    return;
  }

  if (!data) {
    mostrarMensagemEm(
      'rotaMessageBox',
      'error',
      'Informe a data da rota.'
    );

    return;
  }

  if (!urlConfigurada()) {
    mostrarMensagemEm(
      'rotaMessageBox',
      'error',
      'A consulta ainda não está ligada ao Apps Script: a constante ' +
      'APPS_SCRIPT_URL em disponibilidade-frota.js continua com a URL de ' +
      'exemplo. Publique o script como App da Web e cole aqui a URL /exec.'
    );

    return;
  }

  btn.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';

  try {
    const formData = new FormData();

    formData.append('acao', 'consultarRota');
    formData.append('placaConsulta', placa);
    formData.append('dataConsulta', data);

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: formData
    });

    const corpo = await response.text();
    let result;

    try {
      result = JSON.parse(corpo);
    } catch (erroParse) {
      throw new Error(
        `O servidor respondeu ${response.status} sem JSON. Confira se a URL ` +
        'do Apps Script é a de implantação (/exec) e se o acesso está como ' +
        '"Qualquer pessoa".'
      );
    }

    if (result.success) {
      renderizarRotas(result);
    } else {
      mostrarMensagemEm(
        'rotaMessageBox',
        'error',
        (result.message || 'Não foi possível consultar a rota.') +
        renderizarSugestoes(result.sugestoes)
      );

      ligarSugestoes();
    }
  } catch (error) {
    console.error('Erro:', error);

    mostrarMensagemEm(
      'rotaMessageBox',
      'error',
      (error && error.message ? error.message + ' ' : '') +
      'Erro ao consultar a rota. Por favor, tente novamente.'
    );
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

function renderizarRotas(result) {
  const caixaResultado = document.getElementById('rotaResultado');
  const rotas = result.rotas || [];

  // Quando a rota foi achada pela DATA_CARREGAMENTO em vez da data de
  // registro, o rodapé do cartão diz isso — o motorista precisa saber
  // que a data digitada não era a DATA PREENCHEU ROT.
  const buscaPorCarregamento = result.campoBusca === 'DATA_CARREGAMENTO';

  caixaResultado.innerHTML = rotas.map(rota => {
    const ordem = String(rota.ordem || '').trim();
    const rotuloOrdem = ORDEM_ROTULOS[ordem] || ordem;

    const badge = ordem
      ? `<span class="rota-badge ordem-${escaparHtml(ordem)}">` +
        `${escaparHtml(ordem)} — ${escaparHtml(rotuloOrdem)}</span>`
      : '';

    const origem = buscaPorCarregamento
      ? `Encontrada pela DATA_CARREGAMENTO de ${escaparHtml(result.dataConsultada)}` +
        ` (linha ${escaparHtml(String(rota.linha))} da planilha).`
      : `Registrada em ${escaparHtml(rota.dataPreencher)}` +
        ` (linha ${escaparHtml(String(rota.linha))} da planilha).`;

    return `
      <article class="rota-card">
        <div class="rota-card-head">
          <div>
            <span class="rota-label">Rota</span>
            <span class="rota-nome">${escaparHtml(rota.rota)}</span>
          </div>
          ${badge}
        </div>

        <dl class="rota-grid">
          <div>
            <dt>Veículo</dt>
            <dd>${escaparHtml(rota.placa)}</dd>
          </div>
          <div>
            <dt>Motorista</dt>
            <dd>${escaparHtml(rota.motorista || '—')}</dd>
          </div>
          <div>
            <dt>Data de carregamento</dt>
            <dd>${escaparHtml(rota.dataCarregamento || '—')}</dd>
          </div>
        </dl>

        <p class="rota-origem">${origem}</p>
      </article>
    `;
  }).join('');

  caixaResultado.style.display = 'flex';

  caixaResultado.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

// Datas em que a placa tem rota registrada, oferecidas como atalho
// quando a data pedida não tem nada.
function renderizarSugestoes(sugestoes) {
  if (!sugestoes || !sugestoes.length) {
    return '';
  }

  const botoes = sugestoes
    .map(data =>
      `<button type="button" class="btn-sugestao" data-data="${escaparHtml(data)}">` +
      `${escaparHtml(data)}</button>`
    )
    .join('');

  return `<br>Datas com rota para esta placa:` +
    `<span class="rota-sugestoes">${botoes}</span>`;
}

function ligarSugestoes() {
  const caixaMensagem = document.getElementById('rotaMessageBox');

  caixaMensagem.querySelectorAll('.btn-sugestao').forEach(botao => {
    botao.addEventListener('click', function () {
      const campoData = document.getElementById('dataConsulta');

      // A sugestão vem em dd/MM/yyyy; o input[type="date"] só aceita
      // yyyy-MM-dd.
      const partes = this.dataset.data.split('/');

      campoData.value = `${partes[2]}-${partes[1]}-${partes[0]}`;

      document
        .getElementById('consultaRotaForm')
        .dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });
}

// Conteúdo vindo da planilha entra em innerHTML; escapar evita que um
// nome de rota com "<" quebre o cartão.
function escaparHtml(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
