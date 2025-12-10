const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ [ORDEM-COMPRA] ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ [ORDEM-COMPRA] Supabase configurado');

// Configurações de JSON e body parsing
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da aplicação
router.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
        else if (filepath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filepath.endsWith('.html')) res.setHeader('Content-Type', 'text/html');
    }
}));

// Log de requisições
router.use((req, res, next) => {
    console.log(`📥 [ORDEM-COMPRA] ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// AUTENTICAÇÃO - Verificação via Portal
const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3000';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) return next();

    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) {
        console.log('❌ [ORDEM-COMPRA] Token não fornecido');
        return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            console.log('❌ [ORDEM-COMPRA] Sessão inválida - Status:', verifyResponse.status);
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) {
            console.log('❌ [ORDEM-COMPRA] Sessão não válida');
            return res.status(401).json({ error: 'Sessão inválida' });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        console.log('✅ [ORDEM-COMPRA] Autenticação OK:', sessionData.session.username);
        next();
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao verificar autenticação:', error.message);
        return res.status(500).json({ error: 'Erro ao verificar autenticação', details: error.message });
    }
}

// =====================================================
// ROTAS DA API - ORDEM DE COMPRA
// =====================================================

// GET /api/ordens - Buscar todas as ordens
router.get('/api/ordens', verificarAutenticacao, async (req, res) => {
    try {
        console.log('📋 [ORDEM-COMPRA] Listando ordens...');
        const { data, error } = await supabase
            .from('ordens_compra')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        console.log(`✅ [ORDEM-COMPRA] ${data?.length || 0} ordens encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao listar ordens:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar ordens',
            message: error.message
        });
    }
});

// GET /api/ordens/:id - Buscar ordem por ID
router.get('/api/ordens/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔍 [ORDEM-COMPRA] Buscando ordem ID: ${req.params.id}`);
        const { data, error } = await supabase
            .from('ordens_compra')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ [ORDEM-COMPRA] Ordem encontrada');
        res.json(data);
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao buscar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar ordem',
            message: error.message
        });
    }
});

// POST /api/ordens - Criar nova ordem
router.post('/api/ordens', verificarAutenticacao, async (req, res) => {
    try {
        console.log('➕ [ORDEM-COMPRA] Criando nova ordem...');
        
        const { 
            numeroOrdem, responsavel, dataOrdem, razaoSocial, nomeFantasia, 
            cnpj, enderecoFornecedor, site, contato, telefone, email, items, 
            valorTotal, frete, localEntrega, prazoEntrega, transporte, 
            formaPagamento, prazoPagamento, dadosBancarios, status 
        } = req.body;

        const novaOrdem = {
            numero_ordem: numeroOrdem,
            responsavel,
            data_ordem: dataOrdem,
            razao_social: razaoSocial,
            nome_fantasia: nomeFantasia || null,
            cnpj,
            endereco_fornecedor: enderecoFornecedor || null,
            site: site || null,
            contato: contato || null,
            telefone: telefone || null,
            email: email || null,
            items: items || [],
            valor_total: valorTotal || 'R$ 0,00',
            frete: frete || null,
            local_entrega: localEntrega || null,
            prazo_entrega: prazoEntrega || null,
            transporte: transporte || null,
            forma_pagamento: formaPagamento,
            prazo_pagamento: prazoPagamento,
            dados_bancarios: dadosBancarios || null,
            status: status || 'aberta'
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .insert([novaOrdem])
            .select()
            .single();

        if (error) throw error;

        console.log('✅ [ORDEM-COMPRA] Ordem criada com sucesso! ID:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao criar ordem:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar ordem',
            message: error.message
        });
    }
});

// PUT /api/ordens/:id - Atualizar ordem
router.put('/api/ordens/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`✏️ [ORDEM-COMPRA] Atualizando ordem ID: ${req.params.id}`);
        
        const { 
            numeroOrdem, responsavel, dataOrdem, razaoSocial, nomeFantasia, 
            cnpj, enderecoFornecedor, site, contato, telefone, email, items, 
            valorTotal, frete, localEntrega, prazoEntrega, transporte, 
            formaPagamento, prazoPagamento, dadosBancarios, status 
        } = req.body;

        const ordemAtualizada = {
            numero_ordem: numeroOrdem,
            responsavel,
            data_ordem: dataOrdem,
            razao_social: razaoSocial,
            nome_fantasia: nomeFantasia || null,
            cnpj,
            endereco_fornecedor: enderecoFornecedor || null,
            site: site || null,
            contato: contato || null,
            telefone: telefone || null,
            email: email || null,
            items: items || [],
            valor_total: valorTotal || 'R$ 0,00',
            frete: frete || null,
            local_entrega: localEntrega || null,
            prazo_entrega: prazoEntrega || null,
            transporte: transporte || null,
            forma_pagamento: formaPagamento,
            prazo_pagamento: prazoPagamento,
            dados_bancarios: dadosBancarios || null,
            status: status || 'aberta',
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .update(ordemAtualizada)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ [ORDEM-COMPRA] Ordem atualizada com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao atualizar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar ordem',
            message: error.message
        });
    }
});

// PATCH /api/ordens/:id/status - Atualizar apenas status
router.patch('/api/ordens/:id/status', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔄 [ORDEM-COMPRA] Atualizando status da ordem ID: ${req.params.id}`);
        const updates = {
            status: req.body.status,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('ordens_compra')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Ordem não encontrada' });
            }
            throw error;
        }

        console.log('✅ [ORDEM-COMPRA] Status atualizado com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao atualizar status:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar status',
            message: error.message
        });
    }
});

// DELETE /api/ordens/:id - Excluir ordem
router.delete('/api/ordens/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🗑️ [ORDEM-COMPRA] Deletando ordem ID: ${req.params.id}`);
        const { error } = await supabase
            .from('ordens_compra')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        console.log('✅ [ORDEM-COMPRA] Ordem deletada com sucesso!');
        res.json({ success: true, message: 'Ordem removida com sucesso' });
    } catch (error) {
        console.error('❌ [ORDEM-COMPRA] Erro ao deletar ordem:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar ordem',
            message: error.message
        });
    }
});

// ROTAS DE SAÚDE
router.get('/health', (req, res) => {
    res.json({ 
        app: 'ordem-compra',
        status: 'ok', 
        timestamp: new Date().toISOString() 
    });
});

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
