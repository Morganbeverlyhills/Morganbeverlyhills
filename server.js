const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const Redis = require('redis');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import custom modules
const authRoutes = require('./routes/auth');
const smsRoutes = require('./routes/sms');
const campaignRoutes = require('./routes/campaigns');
const blockchainRoutes = require('./routes/blockchain');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

const authMiddleware = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const blockchainService = require('./services/blockchainService');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3001",
  credentials: true
}));

// Logging middleware
app.use(morgan('combined', { 
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sms', authMiddleware, smsRoutes);
app.use('/api/campaigns', authMiddleware, campaignRoutes);
app.use('/api/blockchain', authMiddleware, blockchainRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join_campaign', (campaignId) => {
    socket.join(`campaign_${campaignId}`);
    logger.info(`Client ${socket.id} joined campaign ${campaignId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to other modules
app.set('io', io);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl 
  });
});

// Database connections
async function connectToDatabase() {
  try {
    // MongoDB connection
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blockchain_sms', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB');

    // Redis connection
    const redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
    
    await redis.connect();
    logger.info('Connected to Redis');
    
    // Make Redis available to other modules
    app.set('redis', redis);
    
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Initialize blockchain connection
async function initializeBlockchain() {
  try {
    await blockchainService.initialize();
    logger.info('Blockchain service initialized');
  } catch (error) {
    logger.error('Blockchain initialization failed:', error);
    // Don't exit - allow app to run without blockchain for development
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Start server
async function startServer() {
  try {
    await connectToDatabase();
    await initializeBlockchain();
    
    server.listen(PORT, () => {
      logger.info(`🚀 Blockchain SMS Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Blockchain RPC: ${process.env.BLOCKCHAIN_RPC_URL}`);
      logger.info(`📊 Dashboard available at: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;