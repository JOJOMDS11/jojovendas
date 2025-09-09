const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do banco - Vercel/PlanetScale
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000
};

// Pacotes de Purple Coins
const packages = {
    starter: {
        name: 'Starter Pack',
        purple_coins: 100,
        price: 5.00,
        discount: 0,
        description: 'Pacote inicial perfeito para começar'
    },
    popular: {
        name: 'Popular Pack',
        purple_coins: 500,
        price: 20.00,
        discount: 20,
        description: 'Nosso pacote mais vendido com 20% de desconto'
    },
    premium: {
        name: 'Premium Pack',
        purple_coins: 1000,
        price: 35.00,
        discount: 30,
        description: 'Pacote premium com 30% de desconto'
    },
    ultimate: {
        name: 'Ultimate Pack',
        purple_coins: 2500,
        price: 75.00,
        discount: 40,
        description: 'Pacote ultimate com 40% de desconto'
    }
};

// Função para gerar código único
function generateCode(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Função para gerar PIX Code válido
function generatePixCode(amount, description, recipientName = 'JOJO VENDAS') {
    const formatAmount = amount.toFixed(2);
    const merchantName = recipientName.substring(0, 25);
    const merchantCity = 'SAO PAULO';
    const txId = generateCode(8);
    
    // Formato simplificado do PIX
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${process.env.PIX_KEY || '412dd49e-0f7b-4a52-a5c5-bbf720214931'}520400005303986540${formatAmount.length}${formatAmount}5925${merchantName}6009${merchantCity}62070503${txId}6304`;
    
    return {
        code: pixCode,
        tx_id: txId
    };
}

// Função para gerar pagamento PIX atualizada
async function generatePixPayment(amount, description) {
    try {
        const paymentId = crypto.randomUUID();
        const pixData = generatePixCode(amount, description);
        
        // Gerar QR Code com maior qualidade
        const qrCodeOptions = {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300
        };

        const qrCodeBase64 = await QRCode.toDataURL(pixData.code, qrCodeOptions);
        
        return {
            payment_id: paymentId,
            pix_code: pixData.code,
            qr_code_base64: qrCodeBase64,
            amount: amount,
            status: 'pending',
            tx_id: pixData.tx_id
        };
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        throw new Error('Erro ao gerar pagamento PIX');
    }
}

// Pool de conexões para melhor performance
let connectionPool = null;

async function getConnection() {
    if (!connectionPool) {
        connectionPool = mysql.createPool({
            ...dbConfig,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return connectionPool.getConnection();
}

// Rota principal - página da loja
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// API - Criar pedido (otimizada)
app.post('/api/create-order', async (req, res) => {
    const { package: packageType, customer_email, customer_name } = req.body;

    if (!packages[packageType]) {
        return res.status(400).json({
            success: false,
            message: 'Pacote inválido'
        });
    }

    if (!customer_name || !customer_email) {
        return res.status(400).json({
            success: false,
            message: 'Nome e email são obrigatórios'
        });
    }

    let connection;
    try {
        connection = await getConnection();

        const selectedPackage = packages[packageType];
        const orderId = crypto.randomUUID();
        
        console.log(`🆕 Criando pedido: ${packageType} para ${customer_email}`);
        
        // Gerar pagamento PIX
        const pixPayment = await generatePixPayment(
            selectedPackage.price,
            `Purple Coins - ${selectedPackage.name}`
        );

        console.log(`✅ PIX gerado: ${pixPayment.payment_id}`);

        // Salvar pedido no banco
        await connection.execute(`
            INSERT INTO pix_orders (
                id, package_type, customer_name, customer_email,
                purple_coins_amount, price_brl, payment_id, pix_code,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
        `, [
            orderId,
            packageType,
            customer_name,
            customer_email,
            selectedPackage.purple_coins,
            selectedPackage.price,
            pixPayment.payment_id,
            pixPayment.pix_code
        ]);

        console.log(`💾 Pedido salvo no banco: ${orderId}`);

        res.json({
            success: true,
            order: {
                id: orderId,
                package: {
                    ...selectedPackage,
                    type: packageType
                },
                payment: {
                    id: pixPayment.payment_id,
                    qr_code: pixPayment.qr_code_base64,
                    pix_code: pixPayment.pix_code,
                    amount: selectedPackage.price
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor: ' + error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// API - Verificar status do pagamento
app.get('/api/check-payment/:payment_id', async (req, res) => {
    const { payment_id } = req.params;
    
    let connection;
    try {
        connection = await getConnection();

        const [rows] = await connection.execute(
            'SELECT * FROM pix_orders WHERE payment_id = ?',
            [payment_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pagamento não encontrado'
            });
        }

        const order = rows[0];
        
        res.json({
            success: true,
            payment: {
                id: order.payment_id,
                status: order.status,
                purple_coin_code: order.purple_coin_code || null,
                created_at: order.created_at,
                paid_at: order.paid_at,
                amount: order.price_brl,
                purple_coins: order.purple_coins_amount
            }
        });

    } catch (error) {
        console.error('❌ Erro ao verificar pagamento:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Webhook - Confirmação de pagamento
app.post('/webhook/payment', async (req, res) => {
    const { payment_id, status, external_reference } = req.body;

    console.log(`🔔 Webhook recebido:`, { payment_id, status });

    if (status !== 'approved' && status !== 'paid') {
        return res.json({ success: true, message: 'Pagamento não aprovado' });
    }

    let connection;
    try {
        connection = await getConnection();

        // Buscar pedido
        const [orders] = await connection.execute(
            'SELECT * FROM pix_orders WHERE payment_id = ? AND status = "pending"',
            [payment_id]
        );

        if (orders.length === 0) {
            return res.json({ success: true, message: 'Pedido não encontrado ou já processado' });
        }

        const order = orders[0];
        
        // Gerar código Purple Coins único
        let purpleCoinCode;
        let codeExists = true;
        let attempts = 0;

        while (codeExists && attempts < 10) {
            purpleCoinCode = `PC${order.purple_coins_amount}_${generateCode(8)}`;
            
            // Verificar se código já existe
            const [existing] = await connection.execute(
                'SELECT id FROM purple_coin_codes WHERE code = ?',
                [purpleCoinCode]
            );
            
            codeExists = existing.length > 0;
            attempts++;
        }

        if (codeExists) {
            throw new Error('Não foi possível gerar código único');
        }

        // Atualizar pedido
        await connection.execute(`
            UPDATE pix_orders 
            SET status = 'paid', purple_coin_code = ?, paid_at = NOW()
            WHERE payment_id = ?
        `, [purpleCoinCode, payment_id]);

        // Adicionar código ao sistema do bot
        await connection.execute(`
            INSERT INTO purple_coin_codes (
                code, purple_coins_value, created_by, description, expires_at
            ) VALUES (?, ?, 'JOJO_VENDAS', ?, DATE_ADD(NOW(), INTERVAL 30 DAY))
        `, [
            purpleCoinCode,
            order.purple_coins_amount,
            `Compra PIX - ${order.customer_name} (${order.customer_email})`
        ]);

        console.log(`✅ Código gerado: ${purpleCoinCode} para ${order.customer_email}`);

        res.json({ success: true, message: 'Pagamento processado', code: purpleCoinCode });

    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno'
        });
    } finally {
        if (connection) connection.release();
    }
});

// API - Simular pagamento (APENAS PARA TESTES)
app.post('/api/simulate-payment', async (req, res) => {
    const { payment_id } = req.body;

    console.log(`🧪 Simulando pagamento: ${payment_id}`);

    if (!payment_id) {
        return res.status(400).json({
            success: false,
            message: 'payment_id é obrigatório'
        });
    }

    try {
        // Simular webhook interno
        await new Promise(resolve => {
            const webhookData = {
                payment_id: payment_id,
                status: 'approved'
            };

            // Processar webhook internamente
            simulateWebhookProcessing(webhookData).then(resolve);
        });

        res.json({ success: true, message: 'Pagamento simulado com sucesso!' });
    } catch (error) {
        console.error('❌ Erro ao simular:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

async function simulateWebhookProcessing(data) {
    let connection;
    try {
        connection = await getConnection();

        const [orders] = await connection.execute(
            'SELECT * FROM pix_orders WHERE payment_id = ? AND status = "pending"',
            [data.payment_id]
        );

        if (orders.length === 0) return;

        const order = orders[0];
        const purpleCoinCode = `PC${order.purple_coins_amount}_${generateCode(8)}`;

        await connection.execute(`
            UPDATE pix_orders 
            SET status = 'paid', purple_coin_code = ?, paid_at = NOW()
            WHERE payment_id = ?
        `, [purpleCoinCode, data.payment_id]);

        await connection.execute(`
            INSERT INTO purple_coin_codes (
                code, purple_coins_value, created_by, description, expires_at
            ) VALUES (?, ?, 'JOJO_VENDAS', ?, DATE_ADD(NOW(), INTERVAL 30 DAY))
        `, [
            purpleCoinCode,
            order.purple_coins_amount,
            `TESTE - ${order.customer_name}`
        ]);

        console.log(`✅ TESTE - Código gerado: ${purpleCoinCode}`);
    } finally {
        if (connection) connection.release();
    }
}

// Rota admin
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// API - Stats admin com autenticação
app.get('/api/admin/stats', async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    let connection;
    try {
        connection = await getConnection();

        const [orders] = await connection.execute(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
                SUM(CASE WHEN status = 'paid' THEN price_brl ELSE 0 END) as total_revenue,
                SUM(CASE WHEN status = 'paid' THEN purple_coins_amount ELSE 0 END) as total_coins_sold
            FROM pix_orders
        `);

        const [recent] = await connection.execute(`
            SELECT * FROM pix_orders 
            ORDER BY created_at DESC 
            LIMIT 20
        `);

        res.json({
            success: true,
            stats: orders[0],
            recent_orders: recent
        });

    } catch (error) {
        console.error('❌ Erro ao buscar stats:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno'
        });
    } finally {
        if (connection) connection.release();
    }
});

// API - Informações do sistema
app.get('/api/system/info', (req, res) => {
    res.json({
        success: true,
        system: {
            environment: process.env.NODE_ENV || 'development',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            packages: Object.keys(packages).map(key => ({
                type: key,
                ...packages[key]
            }))
        }
    });
});

// Health check para Vercel
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'JojoVendas Purple Coins'
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint não encontrado'
    });
});

// Iniciar servidor
const server = app.listen(PORT, () => {
    console.log(`
🎮 JojoVendas Purple Coins Server
🌐 Servidor rodando em: http://localhost:${PORT}
📊 Admin panel: http://localhost:${PORT}/admin
💰 Loja: http://localhost:${PORT}
🔗 Webhook: http://localhost:${PORT}/webhook/payment
🔧 Ambiente: ${process.env.NODE_ENV || 'development'}
✅ Sistema pronto para uso!
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Encerrando servidor...');
    server.close(() => {
        if (connectionPool) {
            connectionPool.end();
        }
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
    });
});

module.exports = app;
