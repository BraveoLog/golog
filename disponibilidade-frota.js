// ============================================================
// DISPONIBILIDADE DE FROTA - GOLOG
// JavaScript para validações, máscaras e envio
// ============================================================

// IMPORTANTE: substitua esta URL pela URL do seu Google Apps Script
const APPS_SCRIPT_URL = 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI';

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
});

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

    const result = await response.json();

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
  const messageBox = document.getElementById('messageBox');
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
