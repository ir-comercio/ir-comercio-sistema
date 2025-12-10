const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ [TABELA-PRECOS] ERRO: Variáveis de ambiente do Supabase não configuradas');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ [TABELA-PRECOS] Supabase configurado');

// Middlewares
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// REGISTRO DE ACESSOS SILENCIOSO
const logFilePath = path.join(__dirname, 'acessos.log');
let accessCount = 0;
let uniqueIPs = new Set();

function registrarAcesso(req, res, next) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress;

    const cleanIP = clientIP.replace('::ffff:', '');
    const logEntry = `[${new Date().toISOString()}] ${cleanIP} - ${req.method} ${req.path}\n`;

    // Salva no arquivo (silencioso)
    fs.appendFile(logFilePath, logEntry, () => {});
    
    // Conta acessos (sem mostrar)
    accessCount++;
    uniqueIPs.add(cleanIP);
    
    next();
}

router.use(registrarAcesso);

// Relatório periódico (opcional - a cada 1 hora)
setInterval(() => {
    if (accessCount > 0) {
        console.log(`📊 [TABELA-PRECOS] Última hora: ${accessCount} requisições de ${uniqueIPs.size} IPs únicos`);
        accessCount = 0;
        uniqueIPs.clear();
    }
}, 3600000); // 1 hora

// AUTENTICAÇÃO
const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3000';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Não autenticado',
            redirectToLogin: true
        });
    }

    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        if (!verifyResponse.ok) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();

        if (!sessionData.valid) {
            return res.status(401).json({
                error: 'Sessão inválida',
                redirectToLogin: true
            });
        }

        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro ao verificar autenticação',
            details: error.message
        });
    }
}

// SERVIR ARQUIVOS ESTÁTICOS
router.use(express.static(path.join(__dirname, 'public')));

// =====================================================
// ROTAS DA API - TABELA DE PREÇOS
// =====================================================

// GET /api/produtos - Listar todos os produtos
router.get('/api/produtos', verificarAutenticacao, async (req, res) => {
    try {
        console.log('📋 [TABELA-PRECOS] Listando produtos...');
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        console.log(`✅ [TABELA-PRECOS] ${data?.length || 0} produtos encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao listar produtos:', error);
        res.status(500).json({
            error: 'Erro ao listar produtos',
            message: error.message
        });
    }
});

// GET /api/produtos/:id - Buscar produto por ID
router.get('/api/produtos/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔍 [TABELA-PRECOS] Buscando produto ID: ${req.params.id}`);
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }
            throw error;
        }

        console.log('✅ [TABELA-PRECOS] Produto encontrado');
        res.json(data);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao buscar produto:', error);
        res.status(500).json({
            error: 'Erro ao buscar produto',
            message: error.message
        });
    }
});

// POST /api/produtos - Criar novo produto
router.post('/api/produtos', verificarAutenticacao, async (req, res) => {
    try {
        console.log('➕ [TABELA-PRECOS] Criando novo produto...');
        const { nome, categoria, preco, descricao, estoque } = req.body;

        if (!nome || !categoria || preco === undefined) {
            return res.status(400).json({
                error: 'Campos obrigatórios faltando',
                required: ['nome', 'categoria', 'preco']
            });
        }

        const novoProduto = {
            nome,
            categoria,
            preco,
            descricao: descricao || null,
            estoque: estoque || 0
        };

        const { data, error } = await supabase
            .from('produtos')
            .insert([novoProduto])
            .select()
            .single();

        if (error) throw error;

        console.log('✅ [TABELA-PRECOS] Produto criado com sucesso! ID:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao criar produto:', error);
        res.status(500).json({
            error: 'Erro ao criar produto',
            message: error.message
        });
    }
});

// PUT /api/produtos/:id - Atualizar produto
router.put('/api/produtos/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`✏️ [TABELA-PRECOS] Atualizando produto ID: ${req.params.id}`);
        const { nome, categoria, preco, descricao, estoque } = req.body;

        const produtoAtualizado = {
            nome,
            categoria,
            preco,
            descricao: descricao || null,
            estoque: estoque || 0,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('produtos')
            .update(produtoAtualizado)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }
            throw error;
        }

        console.log('✅ [TABELA-PRECOS] Produto atualizado com sucesso!');
        res.json(data);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao atualizar produto:', error);
        res.status(500).json({
            error: 'Erro ao atualizar produto',
            message: error.message
        });
    }
});

// DELETE /api/produtos/:id - Excluir produto
router.delete('/api/produtos/:id', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🗑️ [TABELA-PRECOS] Deletando produto ID: ${req.params.id}`);
        const { error } = await supabase
            .from('produtos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        console.log('✅ [TABELA-PRECOS] Produto deletado com sucesso!');
        res.json({ success: true, message: 'Produto removido com sucesso' });
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao deletar produto:', error);
        res.status(500).json({
            error: 'Erro ao deletar produto',
            message: error.message
        });
    }
});

// BUSCA E FILTROS
router.get('/api/produtos/search/:termo', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔍 [TABELA-PRECOS] Buscando por: ${req.params.termo}`);
        const termo = `%${req.params.termo}%`;
        
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .or(`nome.ilike.${termo},categoria.ilike.${termo},descricao.ilike.${termo}`)
            .order('nome', { ascending: true });

        if (error) throw error;

        console.log(`✅ [TABELA-PRECOS] ${data?.length || 0} produtos encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao buscar produtos:', error);
        res.status(500).json({
            error: 'Erro ao buscar produtos',
            message: error.message
        });
    }
});

router.get('/api/produtos/categoria/:categoria', verificarAutenticacao, async (req, res) => {
    try {
        console.log(`🔍 [TABELA-PRECOS] Filtrando por categoria: ${req.params.categoria}`);
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .eq('categoria', req.params.categoria)
            .order('nome', { ascending: true });

        if (error) throw error;

        console.log(`✅ [TABELA-PRECOS] ${data?.length || 0} produtos encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ [TABELA-PRECOS] Erro ao filtrar produtos:', error);
        res.status(500).json({
            error: 'Erro ao filtrar produtos',
            message: error.message
        });
    }
});

// ROTAS DE SAÚDE
router.get('/health', (req, res) => {
    res.json({
        app: 'tabela-precos',
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
