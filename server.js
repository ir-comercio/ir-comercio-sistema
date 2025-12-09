require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// ======== CONFIGURAÇÃO GLOBAL =============
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// ==========================================
// ======== IMPORTAR APLICAÇÕES =============
// ==========================================
const portalApp = require('./apps/portal/server');
const ordemCompraApp = require('./apps/ordem-compra/server');
const tabelaPrecosApp = require('./apps/tabela-precos/server');

// ==========================================
// ======== ROTEAMENTO DAS APLICAÇÕES =======
// ==========================================

// 1. PORTAL - Rota raiz (/)
app.use('/', portalApp);

// 2. ORDEM DE COMPRA - Rota /ordem-compra
app.use('/ordem-compra', ordemCompraApp);

// 3. TABELA DE PREÇOS - Rota /tabela-precos
app.use('/tabela-precos', tabelaPrecosApp);

// ==========================================
// ======== HEALTH CHECK GLOBAL =============
// ==========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apps: {
      portal: 'running',
      ordemCompra: 'running',
      tabelaPrecos: 'running'
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==========================================
// ======== TRATAMENTO DE ERROS =============
// ==========================================
app.use((err, req, res, next) => {
  console.error('❌ Erro no servidor:', err);
  res.status(500).json({
    error: 'Erro interno no servidor',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.path,
    availableApps: {
      portal: '/',
      ordemCompra: '/ordem-compra',
      tabelaPrecos: '/tabela-precos'
    }
  });
});

// ==========================================
// ======== INICIAR SERVIDOR ================
// ==========================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 MONOREPO I.R. COMÉRCIO - Rodando na porta ${PORT}`);
  console.log('='.repeat(60));
  console.log('📦 Aplicações disponíveis:');
  console.log(`   🏠 Portal Central:      http://localhost:${PORT}/`);
  console.log(`   📋 Ordem de Compra:     http://localhost:${PORT}/ordem-compra`);
  console.log(`   💰 Tabela de Preços:    http://localhost:${PORT}/tabela-precos`);
  console.log('='.repeat(60));
  console.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(60));
});

// ==========================================
// ======== GRACEFUL SHUTDOWN ===============
// ==========================================
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});
