const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'blockchain-sms' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Write all logs to console if not in production
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            let log = `${timestamp} [${level}]: ${message}`;
            if (stack) {
              log += `\n${stack}`;
            }
            return log;
          })
        )
      })
    ] : [])
  ]
});

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.user?.id,
    walletAddress: req.user?.walletAddress
  };
  
  if (res.statusCode >= 400) {
    logger.warn('HTTP Request Error', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add blockchain transaction logging helper
logger.logBlockchainTransaction = (txData, success = true) => {
  const logLevel = success ? 'info' : 'error';
  logger.log(logLevel, 'Blockchain Transaction', {
    transactionHash: txData.hash,
    gasUsed: txData.gasUsed,
    gasPrice: txData.gasPrice,
    blockNumber: txData.blockNumber,
    from: txData.from,
    to: txData.to,
    value: txData.value,
    success
  });
};

// Add SMS logging helper
logger.logSMS = (smsData, success = true) => {
  const logLevel = success ? 'info' : 'error';
  logger.log(logLevel, 'SMS Operation', {
    campaignId: smsData.campaignId,
    messageId: smsData.messageId,
    recipient: smsData.recipient ? `***${smsData.recipient.slice(-4)}` : 'unknown',
    status: smsData.status,
    provider: smsData.provider || 'twilio',
    cost: smsData.cost,
    deliveryId: smsData.deliveryId,
    success
  });
};

// Add security event logging helper
logger.logSecurityEvent = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;