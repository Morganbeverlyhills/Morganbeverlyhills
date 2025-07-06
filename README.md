# � Blockchain Bulk SMS System

A professional, highly secure bulk SMS system built with blockchain technology for transparency, immutability, and enhanced security.

## 🌟 Features

### 🔐 Security & Blockchain
- **Smart Contract Integration**: All SMS operations logged immutably on blockchain
- **End-to-End Encryption**: Sensitive data protection with hashing
- **Multi-layer Authentication**: JWT tokens, API keys, and optional 2FA
- **Advanced Rate Limiting**: Protection against abuse and spam
- **Comprehensive Audit Trail**: Complete transaction history on blockchain

### 📨 SMS Capabilities
- **Bulk SMS Sending**: Send thousands of messages efficiently
- **Message Queuing**: Background processing with Redis and Bull
- **Delivery Tracking**: Real-time status updates and delivery reports
- **Template Support**: Dynamic message templates with variables
- **Scheduled Campaigns**: Time-based and recurring message campaigns
- **Provider Integration**: Twilio integration with fallback options

### 📊 Analytics & Monitoring
- **Real-time Dashboard**: Live campaign monitoring
- **Detailed Analytics**: Delivery rates, failure analysis, cost tracking
- **WebSocket Updates**: Live progress updates
- **Comprehensive Logging**: Professional logging with Winston
- **Performance Metrics**: Queue statistics and system health

### 💳 Credits & Billing
- **Blockchain Credits**: Ethereum-based credit system
- **Flexible Pricing**: Multiple subscription tiers
- **Usage Tracking**: Detailed consumption analytics
- **Auto-renewal**: Automated subscription management

### 🎯 Enterprise Features
- **Multi-user Support**: Role-based access control
- **API Access**: RESTful API with comprehensive documentation
- **Webhook Support**: Real-time notifications
- **White-label Ready**: Customizable branding
- **Scalable Architecture**: Horizontal scaling support

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Blockchain    │
│   Dashboard     │◄──►│   (Node.js)     │◄──►│   (Ethereum)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌────────┼────────┐
                       │                 │
              ┌─────────▼──┐    ┌────────▼────┐
              │  MongoDB   │    │    Redis    │
              │ (Database) │    │  (Queues)   │
              └────────────┘    └─────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Twilio SMS     │
                              │    Gateway      │
                              └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- MongoDB 4.4+
- Redis 6.0+
- Ethereum wallet and RPC endpoint
- Twilio account (for SMS)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/blockchain-sms.git
   cd blockchain-sms
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database setup**
   ```bash
   # Start MongoDB and Redis
   sudo systemctl start mongodb
   sudo systemctl start redis

   # Or using Docker
   docker-compose up -d mongodb redis
   ```

5. **Deploy smart contracts**
   ```bash
   # Start local blockchain (for development)
   npx hardhat node

   # Deploy contracts
   npm run deploy
   ```

6. **Start the application**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f api
```

## � Configuration

### Environment Variables

```env
# Blockchain Configuration
PRIVATE_KEY=your_wallet_private_key_here
CONTRACT_ADDRESS=deployed_contract_address_here
BLOCKCHAIN_RPC_URL=http://localhost:8545

# SMS Gateway Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/blockchain_sms
REDIS_URL=redis://localhost:6379

# Security Configuration
JWT_SECRET=your_super_secret_jwt_key_here
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🔧 API Documentation

### Authentication

```bash
# Register new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

### Campaign Management

```bash
# Create campaign
curl -X POST http://localhost:3000/api/campaigns \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Marketing Campaign",
    "description": "Summer sale promotion",
    "messageTemplate": {
      "content": "Hi {{name}}, check out our summer sale!"
    },
    "recipients": [
      {
        "phoneNumber": "+1234567890",
        "variables": {"name": "John"}
      }
    ]
  }'

# Send bulk SMS
curl -X POST http://localhost:3000/api/sms/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "campaign_id_here",
    "recipients": ["+1234567890", "+0987654321"],
    "message": "Your promotional message here",
    "options": {
      "batchSize": 50,
      "priority": "normal"
    }
  }'
```

### Blockchain Operations

```bash
# Get blockchain stats
curl -X GET http://localhost:3000/api/blockchain/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get user credits
curl -X GET http://localhost:3000/api/blockchain/credits \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Purchase credits
curl -X POST http://localhost:3000/api/blockchain/credits/purchase \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "ethAmount": "0.1"
  }'
```

## 📊 Smart Contract

### BulkSMSContract Features

- **Campaign Management**: Create and manage SMS campaigns
- **Message Logging**: Immutable message records with privacy hashing
- **Credit System**: Blockchain-based credit management
- **Access Control**: Role-based permissions and authorization
- **Audit Trail**: Complete transaction history

### Contract Methods

```solidity
// Create new campaign
function createCampaign(string memory name, string memory description) 
    external returns (uint256)

// Log SMS message
function logMessage(
    uint256 campaignId,
    string memory recipientHash,
    string memory messageHash,
    string memory deliveryId
) external returns (uint256)

// Update message status
function updateMessageStatus(uint256 messageId, uint8 status) external

// Purchase credits
function purchaseCredits() external payable
```

## 🔐 Security Features

### Data Protection
- **Phone Number Hashing**: SHA-256 hashing for privacy
- **Message Content Hashing**: Secure content storage
- **API Key Encryption**: Secure API access
- **JWT Token Security**: Short-lived tokens with refresh

### Rate Limiting
- **Global Rate Limits**: 100 requests per 15 minutes
- **SMS Rate Limits**: 1000 SMS per hour
- **Authentication Limits**: 5 attempts per 5 minutes
- **User-based Limits**: Dynamic limits based on subscription tier

### Monitoring & Alerts
- **Security Event Logging**: Comprehensive security audit trail
- **Real-time Alerts**: Suspicious activity detection
- **Login Monitoring**: Failed attempt tracking
- **IP Address Tracking**: Geographic access monitoring

## 📈 Monitoring & Analytics

### Dashboard Features
- **Real-time Campaign Monitoring**: Live progress tracking
- **Delivery Analytics**: Success/failure rates
- **Cost Tracking**: Detailed expense analysis
- **User Activity**: Access and usage patterns

### Logging
- **Structured Logging**: JSON-formatted logs
- **Log Levels**: Debug, Info, Warn, Error
- **Log Rotation**: Automatic file rotation
- **Centralized Logging**: ELK stack compatible

## 🧪 Testing

```bash
# Run smart contract tests
npm run test

# Run API tests
npm run test:api

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

## 🚀 Deployment

### Production Deployment

1. **Server Requirements**
   - 4+ CPU cores
   - 8GB+ RAM
   - 100GB+ SSD storage
   - Ubuntu 20.04+ or CentOS 8+

2. **Production Environment**
   ```bash
   # Set production environment
   export NODE_ENV=production
   
   # Use PM2 for process management
   npm install -g pm2
   pm2 start server.js --name "blockchain-sms"
   pm2 startup
   pm2 save
   ```

3. **Database Optimization**
   ```bash
   # MongoDB optimization
   # Redis optimization
   # Index creation
   ```

4. **Load Balancing**
   ```nginx
   # Nginx configuration
   upstream blockchain_sms {
       server 127.0.0.1:3000;
       server 127.0.0.1:3001;
   }
   ```

### Monitoring Setup

```bash
# Install monitoring tools
npm install -g @elastic/elasticsearch
npm install -g kibana
npm install -g logstash

# Setup Prometheus metrics
# Configure Grafana dashboards
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Full API Documentation](docs/api.md)
- **Issues**: [GitHub Issues](https://github.com/your-repo/blockchain-sms/issues)
- **Discord**: [Community Discord](https://discord.gg/your-discord)
- **Email**: support@your-domain.com

## 🔄 Changelog

### v1.0.0 (Latest)
- ✅ Initial release
- ✅ Blockchain integration
- ✅ Bulk SMS functionality
- ✅ Real-time monitoring
- ✅ Complete API
- ✅ Security features

## 🎯 Roadmap

### Q1 2024
- [ ] Multi-chain support (Polygon, BSC)
- [ ] Advanced analytics dashboard
- [ ] Machine learning delivery optimization
- [ ] WhatsApp integration

### Q2 2024
- [ ] Multi-tenant architecture
- [ ] Advanced reporting system
- [ ] AI-powered content optimization
- [ ] Mobile application

---

**Built with ❤️ using Blockchain Technology**

For detailed setup instructions, API documentation, and advanced configuration, please refer to our [comprehensive documentation](docs/).
