const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const QRCode = require('qrcode');
const mercadopago = require('mercadopago');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do banco
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'haxball_dreamteam',
    port: process.env.DB_PORT || 3306
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

// Função para gerar PIX (Mercado Pago)
async function generatePixPayment(amount, description, customer_email) {
    try {
        const payment = await mercadopago.payment.create({
            transaction_amount: Number(amount),
            payment_method_id: 'pix',
            description: description,
            payer: {
                email: customer_email
            }
        });
        const paymentId = payment.body.id;
        const pixCode = payment.body.point_of_interaction.transaction_data.qr_code;
        const qrCodeBase64 = 'data:image/png;base64,' + payment.body.point_of_interaction.transaction_data.qr_code_base64;
        return {
            payment_id: paymentId,
            pix_code: pixCode,
            qr_code_base64: qrCodeBase64,
            amount: amount,
            status: 'pending'
        };
    } catch (error) {
        console.error('Erro ao criar pagamento PIX Mercado Pago:', error);
        throw new Error('Erro ao criar pagamento PIX Mercado Pago');
    }
}

// Rota principal - página da loja
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// API - Criar pedido
app.post('/api/create-order', async (req, res) => {
    const { package: packageType, customer_email, customer_name } = req.body;

    if (!packages[packageType]) {
        return res.status(400).json({
            success: false,
            message: 'Pacote inválido'
        });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const selectedPackage = packages[packageType];
        const orderId = crypto.randomUUID();

        // Gerar pagamento PIX
        const pixPayment = await generatePixPayment(
            selectedPackage.price,
            `Purple Coins - ${selectedPackage.name}`,
            customer_email
        );

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

        res.json({
            success: true,
            order: {
                id: orderId,
                package: selectedPackage,
                payment: {
                    id: pixPayment.payment_id,
                    qr_code: pixPayment.qr_code_base64,
                    pix_code: pixPayment.pix_code,
                    amount: selectedPackage.price
                }
            }
        });

    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// API - Verificar status do pagamento
app.get('/api/check-payment/:payment_id', async (req, res) => {
    const { payment_id } = req.params;

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

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
                paid_at: order.paid_at
            }
        });

    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Webhook - Confirmação de pagamento (simulado)
app.post('/webhook/payment', async (req, res) => {
    const { payment_id, status } = req.body;

    if (status !== 'approved') {
        return res.json({ success: true, message: 'Pagamento não aprovado' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        // Buscar pedido
        const [orders] = await connection.execute(
            'SELECT * FROM pix_orders WHERE payment_id = ? AND status = "pending"',
            [payment_id]
        );

        if (orders.length === 0) {
            return res.json({ success: true, message: 'Pedido não encontrado ou já processado' });
        }

        const order = orders[0];

        // Gerar código Purple Coins
        const purpleCoinCode = `PC${order.purple_coins_amount}_${generateCode(8)}`;

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
            `Compra PIX - ${order.customer_name}`
        ]);

        console.log(`✅ Código gerado: ${purpleCoinCode} para ${order.customer_email}`);

        res.json({ success: true, message: 'Pagamento processado' });

    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// API - Simular pagamento (APENAS PARA TESTES)
app.post('/api/simulate-payment', async (req, res) => {
    const { payment_id } = req.body;

    // Simular webhook de confirmação
    const webhookData = {
        payment_id: payment_id,
        status: 'approved'
    };

    // Chamar nosso próprio webhook
    const axios = require('axios');
    try {
        await axios.post(`http://localhost:${PORT}/webhook/payment`, webhookData);
        res.json({ success: true, message: 'Pagamento simulado com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao simular pagamento' });
    }
});

// Rota admin
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// API - Stats admin
app.get('/api/admin/stats', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

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
            LIMIT 10
        `);

        res.json({
            success: true,
            stats: orders[0],
            recent_orders: recent
        });

    } catch (error) {
        console.error('Erro ao buscar stats:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
🎮 JojoVendas Purple Coins Server
🌐 Servidor rodando em: http://localhost:${PORT}
📊 Admin panel: http://localhost:${PORT}/admin
💰 Loja: http://localhost:${PORT}
🔗 Webhook: http://localhost:${PORT}/webhook/payment
    `);
});
