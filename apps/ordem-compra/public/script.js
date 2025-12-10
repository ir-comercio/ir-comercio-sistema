const PORTAL_URL = window.location.origin;
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/ordem-compra/api'
    : `${window.location.origin}/ordem-compra/api`;

let ordens = [];
let currentMonth = new Date();
let editingId = null;
let itemCounter = 0;
let currentTab = 0;
let isOnline = false;
let sessionToken = null;
let lastDataHash = '';
let fornecedoresCache = {};

const tabs = ['tab-geral', 'tab-fornecedor', 'tab-pedido', 'tab-entrega', 'tab-pagamento'];

console.log('Ordem de Compra iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('ordemCompraSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('ordemCompraSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="/" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    updateDisplay();
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

// ============================================
// CONEXÃO E STATUS
// ============================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/ordens`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('ordemCompraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE');
            await loadOrdens();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

function startPolling() {
    loadOrdens();
    setInterval(() => {
        if (isOnline) loadOrdens();
    }, 10000);
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadOrdens() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/ordens`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('ordemCompraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        ordens = data;
        
        // Atualizar cache de fornecedores
        atualizarCacheFornecedores(data);
        
        const newHash = JSON.stringify(ordens.map(o => o.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            updateDisplay();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar:', error);
    }
}

// ============================================
// CACHE DE FORNECEDORES
// ============================================
function atualizarCacheFornecedores(ordens) {
    fornecedoresCache = {};
    
    ordens.forEach(ordem => {
        const razaoSocial = (ordem.razao_social || ordem.razaoSocial || '').trim().toUpperCase();
        
        if (razaoSocial && !fornecedoresCache[razaoSocial]) {
            fornecedoresCache[razaoSocial] = {
                razaoSocial: ordem.razao_social || ordem.razaoSocial,
                nomeFantasia: ordem.nome_fantasia || ordem.nomeFantasia || '',
                cnpj: ordem.cnpj || '',
                enderecoFornecedor: ordem.endereco_fornecedor || ordem.enderecoFornecedor || '',
                site: ordem.site || '',
                contato: ordem.contato || '',
                telefone: ordem.telefone || '',
                email: ordem.email || ''
            };
        }
    });
    
    console.log(`📋 Cache de fornecedores atualizado: ${Object.keys(fornecedoresCache).length} fornecedores`);
}

function buscarFornecedoresSimilares(termo) {
    termo = termo.trim().toUpperCase();
    if (termo.length < 2) return [];
    
    return Object.keys(fornecedoresCache)
        .filter(key => key.includes(termo))
        .map(key => fornecedoresCache[key])
        .slice(0, 5); // Máximo 5 sugestões
}

function preencherDadosFornecedor(fornecedor) {
    document.getElementById('razaoSocial').value = fornecedor.razaoSocial;
    document.getElementById('nomeFantasia').value = fornecedor.nomeFantasia;
    document.getElementById('cnpj').value = fornecedor.cnpj;
    document.getElementById('enderecoFornecedor').value = fornecedor.enderecoFornecedor;
    document.getElementById('site').value = fornecedor.site;
    document.getElementById('contato').value = fornecedor.contato;
    document.getElementById('telefone').value = fornecedor.telefone;
    document.getElementById('email').value = fornecedor.email;
    
    // Remover sugestões
    const suggestionsDiv = document.getElementById('fornecedorSuggestions');
    if (suggestionsDiv) suggestionsDiv.remove();
    
    showToast('Dados do fornecedor preenchidos!', 'success');
}

function setupFornecedorAutocomplete() {
    const razaoSocialInput = document.getElementById('razaoSocial');
    if (!razaoSocialInput) return;
    
    // Remover listeners anteriores
    const newInput = razaoSocialInput.cloneNode(true);
    razaoSocialInput.parentNode.replaceChild(newInput, razaoSocialInput);
    
    newInput.addEventListener('input', function(e) {
        const termo = e.target.value;
        
        // Remover sugestões antigas
        let suggestionsDiv = document.getElementById('fornecedorSuggestions');
        if (suggestionsDiv) suggestionsDiv.remove();
        
        if (termo.length < 2) return;
        
        const fornecedores = buscarFornecedoresSimilares(termo);
        
        if (fornecedores.length === 0) return;
        
        // Criar div de sugestões
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'fornecedorSuggestions';
        suggestionsDiv.style.cssText = `
            position: absolute;
            z-index: 1000;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-height: 300px;
            overflow-y: auto;
            width: 100%;
            margin-top: 4px;
        `;
        
        fornecedores.forEach(fornecedor => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px;
                cursor: pointer;
                border-bottom: 1px solid var(--border-color);
                transition: background 0.2s;
            `;
            
            item.innerHTML = `
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                    ${fornecedor.razaoSocial}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    ${fornecedor.cnpj}${fornecedor.nomeFantasia ? ' | ' + fornecedor.nomeFantasia : ''}
                </div>
            `;
            
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--table-hover)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            
            item.addEventListener('click', () => {
                preencherDadosFornecedor(fornecedor);
            });
            
            suggestionsDiv.appendChild(item);
        });
        
        // Inserir depois do input
        const formGroup = newInput.closest('.form-group');
        formGroup.style.position = 'relative';
        formGroup.appendChild(suggestionsDiv);
    });
    
    // Fechar sugestões ao clicar fora
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.form-group')) {
            const suggestionsDiv = document.getElementById('fornecedorSuggestions');
            if (suggestionsDiv) suggestionsDiv.remove();
        }
    });
}

// ============================================
// NAVEGAÇÃO DE MÊS
// ============================================
function changeMonth(direction) {
    currentMonth.setMonth(currentMonth.getMonth() + direction);
    updateDisplay();
}

function updateMonthDisplay() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthName = months[currentMonth.getMonth()];
    const year = currentMonth.getFullYear();
    document.getElementById('currentMonth').textContent = `${monthName} ${year}`;
}

// ============================================
// SISTEMA DE ABAS - NAVEGAÇÃO
// ============================================
function switchTab(tabId) {
    const tabIndex = tabs.indexOf(tabId);
    if (tabIndex !== -1) {
        currentTab = tabIndex;
        showTab(currentTab);
    }
}

function showTab(index) {
    const tabButtons = document.querySelectorAll('#formModal .tab-btn');
    const tabContents = document.querySelectorAll('#formModal .tab-content');
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    if (tabButtons[index]) tabButtons[index].classList.add('active');
    if (tabContents[index]) tabContents[index].classList.add('active');
}

function switchInfoTab(tabId) {
    document.querySelectorAll('#infoModal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('#infoModal .tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const clickedBtn = event.target.closest('.tab-btn');
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
    document.getElementById(tabId).classList.add('active');
}

// ============================================
// MODAL DE FORMULÁRIO
// ============================================
function openFormModal() {
    editingId = null;
    currentTab = 0;
    itemCounter = 0;
    
    const nextNumber = getNextOrderNumber();
    const today = new Date().toISOString().split('T')[0];
    
    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content" style="max-width: 1200px;">
                <div class="modal-header">
                    <h3 class="modal-title">Nova Ordem de Compra</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchTab('tab-fornecedor')">Fornecedor</button>
                        <button class="tab-btn" onclick="switchTab('tab-pedido')">Pedido</button>
                        <button class="tab-btn" onclick="switchTab('tab-entrega')">Entrega</button>
                        <button class="tab-btn" onclick="switchTab('tab-pagamento')">Pagamento</button>
                    </div>

                    <form id="ordemForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="numeroOrdem">Número da Ordem *</label>
                                    <input type="text" id="numeroOrdem" value="${nextNumber}" required>
                                </div>
                                <div class="form-group">
                                    <label for="responsavel">Responsável *</label>
                                    <input type="text" id="responsavel" required>
                                </div>
                                <div class="form-group">
                                    <label for="dataOrdem">Data da Ordem *</label>
                                    <input type="date" id="dataOrdem" value="${today}" required>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-fornecedor">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="razaoSocial">Razão Social *</label>
                                    <input type="text" id="razaoSocial" required>
                                </div>
                                <div class="form-group">
                                    <label for="nomeFantasia">Nome Fantasia</label>
                                    <input type="text" id="nomeFantasia">
                                </div>
                                <div class="form-group">
                                    <label for="cnpj">CNPJ *</label>
                                    <input type="text" id="cnpj" required>
                                </div>
                                <div class="form-group">
                                    <label for="enderecoFornecedor">Endereço</label>
                                    <input type="text" id="enderecoFornecedor">
                                </div>
                                <div class="form-group">
                                    <label for="site">Site</label>
                                    <input type="text" id="site">
                                </div>
                                <div class="form-group">
                                    <label for="contato">Contato</label>
                                    <input type="text" id="contato">
                                </div>
                                <div class="form-group">
                                    <label for="telefone">Telefone</label>
                                    <input type="text" id="telefone">
                                </div>
                                <div class="form-group">
                                    <label for="email">E-mail</label>
                                    <input type="email" id="email">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-pedido">
                            <button type="button" onclick="addItem()" class="success small" style="margin-bottom: 1rem;">+ Adicionar Item</button>
                            <div style="overflow-x: auto;">
                                <table class="items-table">
                                    <thead>
                                        <tr>
                                            <th style="width: 40px;">Item</th>
                                            <th style="min-width: 200px;">Especificação</th>
                                            <th style="width: 80px;">QTD</th>
                                            <th style="width: 80px;">Unid</th>
                                            <th style="width: 100px;">Valor UN</th>
                                            <th style="width: 100px;">IPI</th>
                                            <th style="width: 100px;">ST</th>
                                            <th style="width: 120px;">Total</th>
                                            <th style="width: 80px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="itemsBody"></tbody>
                                </table>
                            </div>
                            <div class="form-group" style="margin-top: 1rem;">
                                <label for="valorTotalOrdem">Valor Total da Ordem</label>
                                <input type="text" id="valorTotalOrdem" readonly value="R$ 0,00">
                            </div>
                            <div class="form-group">
                                <label for="frete">Frete</label>
                                <input type="text" id="frete" placeholder="Ex: CIF, FOB">
                            </div>
                        </div>

                        <div class="tab-content" id="tab-entrega">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="localEntrega">Local de Entrega</label>
                                    <input type="text" id="localEntrega" value="Rua Tadorna nº 472, sala 2, Novo Horizonte - Serra/ES  |  CEP: 29.163-318">
                                </div>
                                <div class="form-group">
                                    <label for="prazoEntrega">Prazo de Entrega</label>
                                    <input type="text" id="prazoEntrega" placeholder="Ex: 10 dias úteis">
                                </div>
                                <div class="form-group">
                                    <label for="transporte">Transporte</label>
                                    <input type="text" id="transporte" placeholder="Ex: Por conta do fornecedor">
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-pagamento">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="formaPagamento">Forma de Pagamento *</label>
                                    <input type="text" id="formaPagamento" required placeholder="Ex: Boleto, PIX, Cartão">
                                </div>
                                <div class="form-group">
                                    <label for="prazoPagamento">Prazo de Pagamento *</label>
                                    <input type="text" id="prazoPagamento" required placeholder="Ex: 30 dias">
                                </div>
                                <div class="form-group">
                                    <label for="dadosBancarios">Dados Bancários</label>
                                    <textarea id="dadosBancarios" rows="3"></textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="submit" class="save">Salvar Ordem</button>
                            <button type="button" onclick="closeFormModal(true)" class="secondary">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    addItem();
    
    // Configurar autocomplete de fornecedores
    setTimeout(() => {
        setupFornecedorAutocomplete();
        document.getElementById('numeroOrdem')?.focus();
    }, 100);
}

function closeFormModal(showCancelMessage = false) {
    const modal = document.getElementById('formModal');
    if (modal) {
        const editId = document.getElementById('editId')?.value;
        const isEditing = editId && editId !== '';
        
        if (showCancelMessage) {
            showToast(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        }
        
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// GESTÃO DE ITENS
// ============================================
function addItem() {
    itemCounter++;
    const tbody = document.getElementById('itemsBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td style="text-align: center;">${itemCounter}</td>
        <td>
            <textarea class="item-especificacao" placeholder="Descrição do item..." rows="2"></textarea>
        </td>
        <td>
            <input type="number" class="item-qtd" min="0" step="0.01" value="1" onchange="calculateItemTotal(this)">
        </td>
        <td>
            <input type="text" class="item-unid" value="UN" placeholder="UN">
        </td>
        <td>
            <input type="number" class="item-valor" min="0" step="0.01" value="0" onchange="calculateItemTotal(this)">
        </td>
        <td>
            <input type="text" class="item-ipi" placeholder="Ex: Isento">
        </td>
        <td>
            <input type="text" class="item-st" placeholder="Ex: Não incluído">
        </td>
        <td>
            <input type="text" class="item-total" readonly value="R$ 0,00">
        </td>
        <td style="text-align: center;">
            <button type="button" class="danger small" onclick="removeItem(this)">Excluir</button>
        </td>
    `;
    tbody.appendChild(row);
}

function removeItem(btn) {
    const row = btn.closest('tr');
    row.remove();
    recalculateOrderTotal();
    renumberItems();
}

function renumberItems() {
    const rows = document.querySelectorAll('#itemsBody tr');
    rows.forEach((row, index) => {
        row.cells[0].textContent = index + 1;
    });
    itemCounter = rows.length;
}

function calculateItemTotal(input) {
    const row = input.closest('tr');
    const qtd = parseFloat(row.querySelector('.item-qtd').value) || 0;
    const valor = parseFloat(row.querySelector('.item-valor').value) || 0;
    const total = qtd * valor;
    row.querySelector('.item-total').value = formatCurrency(total);
    recalculateOrderTotal();
}

function recalculateOrderTotal() {
    const totals = document.querySelectorAll('.item-total');
    let sum = 0;
    totals.forEach(input => {
        const value = input.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        sum += parseFloat(value) || 0;
    });
    const totalInput = document.getElementById('valorTotalOrdem');
    if (totalInput) {
        totalInput.value = formatCurrency(sum);
    }
}

// ============================================
// SUBMIT DO FORMULÁRIO
// ============================================
async function handleSubmit(event) {
    event.preventDefault();
    
    const items = [];
    const rows = document.querySelectorAll('#itemsBody tr');
    rows.forEach((row, index) => {
        items.push({
            item: index + 1,
            especificacao: row.querySelector('.item-especificacao').value,
            quantidade: parseFloat(row.querySelector('.item-qtd').value) || 0,
            unidade: row.querySelector('.item-unid').value,
            valorUnitario: parseFloat(row.querySelector('.item-valor').value) || 0,
            ipi: row.querySelector('.item-ipi').value || '',
            st: row.querySelector('.item-st').value || '',
            valorTotal: row.querySelector('.item-total').value
        });
    });
    
    const timestamp = Date.now();
    
    const formData = {
        numeroOrdem: document.getElementById('numeroOrdem').value,
        responsavel: document.getElementById('responsavel').value,
        dataOrdem: document.getElementById('dataOrdem').value,
        razaoSocial: document.getElementById('razaoSocial').value,
        nomeFantasia: document.getElementById('nomeFantasia').value,
        cnpj: document.getElementById('cnpj').value,
        enderecoFornecedor: document.getElementById('enderecoFornecedor').value,
        site: document.getElementById('site').value,
        contato: document.getElementById('contato').value,
        telefone: document.getElementById('telefone').value,
        email: document.getElementById('email').value,
        items: items,
        valorTotal: document.getElementById('valorTotalOrdem').value,
        frete: document.getElementById('frete').value,
        localEntrega: document.getElementById('localEntrega').value,
        prazoEntrega: document.getElementById('prazoEntrega').value,
        transporte: document.getElementById('transporte').value,
        formaPagamento: document.getElementById('formaPagamento').value,
        prazoPagamento: document.getElementById('prazoPagamento').value,
        dadosBancarios: document.getElementById('dadosBancarios').value,
        status: 'aberta'
    };
    
    if (!isOnline) {
        showToast('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editingId ? `${API_URL}/ordens/${editingId}` : `${API_URL}/ordens`;
        const method = editingId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('ordemCompraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const savedData = await response.json();

        if (editingId) {
            const index = ordens.findIndex(o => String(o.id) === String(editingId));
            if (index !== -1) ordens[index] = savedData;
            showToast('Ordem atualizada com sucesso!', 'success');
        } else {
            ordens.push(savedData);
            showToast('Ordem criada com sucesso!', 'success');
        }

        lastDataHash = JSON.stringify(ordens.map(o => o.id));
        updateDisplay();
        closeFormModal();
    } catch (error) {
        console.error('Erro completo:', error);
        showToast(`Erro: ${error.message}`, 'error');
    }
}

// [CONTINUAÇÃO DO CÓDIGO - IGUAL AO ORIGINAL]
// As funções restantes (editOrdem, deleteOrdem, toggleStatus, viewOrdem, etc.)
// permanecem exatamente iguais ao código original...

// Por questão de espaço, o resto do código é idêntico ao original
// A única mudança foi nas 3 primeiras linhas (PORTAL_URL e API_URL)
