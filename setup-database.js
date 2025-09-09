const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'haxball_dreamteam',
    port: process.env.DB_PORT || 3306
};

async function setupDatabase() {
    let connection;

    try {
        console.log('🔧 Configurando banco de dados para JojoVendas...');

        connection = await mysql.createConnection(dbConfig);

        // Criar tabela de pedidos PIX
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS pix_orders (
                id VARCHAR(36) PRIMARY KEY,
                package_type VARCHAR(50) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_email VARCHAR(255) NOT NULL,
                purple_coins_amount INT NOT NULL,
                price_brl DECIMAL(10,2) NOT NULL,
                payment_id VARCHAR(255) NOT NULL,
                pix_code TEXT NOT NULL,
                purple_coin_code VARCHAR(100) NULL,
                status ENUM('pending', 'paid', 'expired', 'failed') DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                paid_at DATETIME NULL,
                
                INDEX idx_payment_id (payment_id),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at),
                INDEX idx_customer_email (customer_email)
            )
        `);

        console.log('✅ Tabela pix_orders criada com sucesso!');

        // Verificar se as tabelas do bot existem
        const [tables] = await connection.execute("SHOW TABLES LIKE 'purple_coin_codes'");

        if (tables.length === 0) {
            console.log('⚠️  Tabela purple_coin_codes não encontrada. Criando...');

            await connection.execute(`
                CREATE TABLE IF NOT EXISTS purple_coin_codes (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    purple_coins_value INT NOT NULL DEFAULT 100,
                    used_by_discord_id VARCHAR(50) NULL,
                    used_at DATETIME NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NULL,
                    created_by VARCHAR(50) DEFAULT 'ADMIN',
                    description TEXT NULL,
                    
                    INDEX idx_code (code),
                    INDEX idx_used (used_by_discord_id),
                    INDEX idx_created (created_at),
                    INDEX idx_expires (expires_at)
                )
            `);

            console.log('✅ Tabela purple_coin_codes criada!');
        }

        // Inserir alguns dados de teste
        console.log('📝 Inserindo dados de teste...');

        const testOrder = {
            id: require('crypto').randomUUID(),
            package_type: 'starter',
            customer_name: 'João Teste',
            customer_email: 'joao@teste.com',
            purple_coins_amount: 100,
            price_brl: 5.00,
            payment_id: 'TEST_' + Date.now(),
            pix_code: '00020126580014BR.GOV.BCB.PIX01365.00TESTECODE5204000053039865405.005925JOJO VENDAS PURPLE COINS6009SAO PAULO62070503***6304',
            status: 'paid',
            purple_coin_code: 'PC100_TESTE123'
        };

        try {
            await connection.execute(`
                INSERT INTO pix_orders (
                    id, package_type, customer_name, customer_email,
                    purple_coins_amount, price_brl, payment_id, pix_code,
                    status, purple_coin_code, created_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                testOrder.id, testOrder.package_type, testOrder.customer_name,
                testOrder.customer_email, testOrder.purple_coins_amount,
                testOrder.price_brl, testOrder.payment_id, testOrder.pix_code,
                testOrder.status, testOrder.purple_coin_code
            ]);

            console.log('✅ Pedido de teste inserido!');
        } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
                throw error;
            }
            console.log('ℹ️  Dados de teste já existem');
        }

        // Mostrar estatísticas
        const [stats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
                SUM(CASE WHEN status = 'paid' THEN price_brl ELSE 0 END) as total_revenue,
                SUM(CASE WHEN status = 'paid' THEN purple_coins_amount ELSE 0 END) as total_coins_sold
            FROM pix_orders
        `);

        console.log('\n📊 ESTATÍSTICAS ATUAIS:');
        console.log('Total de Pedidos:', stats[0].total_orders);
        console.log('Pedidos Pagos:', stats[0].paid_orders);
        console.log('Receita Total: R$', stats[0].total_revenue);
        console.log('Purple Coins Vendidas:', stats[0].total_coins_sold);

        console.log('\n🎉 Banco de dados configurado com sucesso!');
        console.log('\n🚀 Para iniciar o servidor:');
        console.log('1. Configure o arquivo .env com suas credenciais');
        console.log('2. Execute: npm install');
        console.log('3. Execute: npm start');
        console.log('4. Acesse: http://localhost:3000');
        console.log('5. Admin: http://localhost:3000/admin (senha: eojojos)');

    } catch (error) {
        console.error('❌ Erro ao configurar banco:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    if (process.env.VERCEL) {
        console.log('⚠️  Este script não deve ser executado automaticamente no Vercel.');
        console.log('Configure seu banco de dados MySQL em um provedor externo (ex: PlanetScale) e rode este script localmente para criar as tabelas.');
        process.exit(0);
    } else {
        setupDatabase();
    }
}

module.exports = { setupDatabase };
