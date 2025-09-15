# 💰 JojoVendas - Sistema de Vendas Purple Coins

Sistema completo de vendas de Purple Coins para HaxBall DreamTeam via PIX.

## 🎯 **Funcionalidades**

### 🛒 **Loja Online**
- **4 pacotes** de Purple Coins disponíveis
- **Interface moderna** e responsiva
- **Pagamento via PIX** com QR Code
- **Geração automática** de códigos
- **Entrega instantânea** após pagamento

### 💳 **Pacotes Disponíveis**
| Pacote | Purple Coins | Preço | Desconto |
|--------|-------------|-------|----------|
| �� Starter | 500 PC | R$ 7,50 | - |
| 🔥 Popular | 1500 PC | R$ 15,00 | - |
| 💎 Premium | 2200 PC | R$ 22,00 | - |
| 🚀 Ultimate | 4000 PC | R$ 50,00 | - |

### 🔧 **Admin Panel**
- **Dashboard** com estatísticas de vendas
- **Monitoramento** em tempo real
- **Histórico** de pedidos
- **Controle total** das transações

## 🚀 **Instalação**

### **1. Clone o repositório**
```bash
git clone https://github.com/JOJOMDS11/jojovendas.git
cd jojovendas
```

### **2. Configure as variáveis**
```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

### **3. Instale dependências**
```bash
npm install
```

### **4. Configure o banco de dados**
```bash
node setup-database.js
```

### **5. Inicie o servidor**
```bash
npm start
```

## ⚙️ **Configuração**

### **📝 Arquivo .env**
```env
# Banco de Dados
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha_mysql
DB_NAME=haxball_dreamteam
DB_PORT=3306

# Mercado Pago
MP_ACCESS_TOKEN=seu_access_token
MP_PUBLIC_KEY=sua_public_key

# Servidor
PORT=3000
ADMIN_PASSWORD=
```

## 🎮 **Como Usar**

### **👤 Para Clientes**
1. Acesse `http://localhost:3000`
2. Escolha um pacote de Purple Coins
3. Preencha nome e email
4. Pague via PIX (QR Code ou código)
5. Receba o código automaticamente
6. Use `/codigo SEU_CODIGO` no Discord

### **🔧 Para Admins**
1. Acesse `http://localhost:3000/admin`
2. Digite senha: 
3. Monitore vendas em tempo real

---

**🎮 Desenvolvido para HaxBall DreamTeam**

