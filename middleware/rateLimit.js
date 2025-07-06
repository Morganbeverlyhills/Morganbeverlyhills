const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../utils/logger');

// Redis connection for rate limiting
let redisClient = null;

// Fallback to memory if Redis is not available
let rateLimiters = {};

const initializeRateLimiters = (redis = null) => {
  redisClient = redis;
  
  const rateLimiterConfig = {
    keyPrefix: 'rl_blockchain_sms',
    points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 900, // Convert to seconds
    blockDuration: 60, // Block for 1 minute if limit exceeded
    execEvenly: true,
  };

  if (redisClient) {
    // Use Redis-based rate limiter for production
    rateLimiters.global = new RateLimiterRedis({
      storeClient: redisClient,
      ...rateLimiterConfig
    });

    rateLimiters.auth = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_auth',
      points: 5, // 5 attempts
      duration: 300, // per 5 minutes
      blockDuration: 900, // block for 15 minutes
      ...rateLimiterConfig
    });

    rateLimiters.sms = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_sms',
      points: 1000, // 1000 SMS per hour
      duration: 3600,
      blockDuration: 3600,
      ...rateLimiterConfig
    });

    rateLimiters.api = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_api',
      points: 10000, // 10000 API calls per hour
      duration: 3600,
      blockDuration: 300,
      ...rateLimiterConfig
    });

  } else {
    // Fallback to memory-based rate limiter
    logger.warn('Redis not available, using memory-based rate limiting');
    
    rateLimiters.global = new RateLimiterMemory(rateLimiterConfig);
    
    rateLimiters.auth = new RateLimiterMemory({
      points: 5,
      duration: 300,
      blockDuration: 900,
    });

    rateLimiters.sms = new RateLimiterMemory({
      points: 1000,
      duration: 3600,
      blockDuration: 3600,
    });

    rateLimiters.api = new RateLimiterMemory({
      points: 10000,
      duration: 3600,
      blockDuration: 300,
    });
  }
};

// General rate limiting middleware
const rateLimitMiddleware = (req, res, next) => {
  if (!rateLimiters.global) {
    // Initialize with app's Redis instance if available
    const redis = req.app?.get('redis');
    initializeRateLimiters(redis);
  }

  const key = getClientKey(req);
  
  rateLimiters.global.consume(key)
    .then((rateLimiterRes) => {
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': rateLimiters.global.points,
        'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext)
      });
      
      next();
    })
    .catch((rateLimiterRes) => {
      logger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        remainingPoints: rateLimiterRes?.remainingPoints || 0,
        totalHits: rateLimiterRes?.totalHits || 0
      });

      res.set({
        'X-RateLimit-Limit': rateLimiters.global.points,
        'X-RateLimit-Remaining': rateLimiterRes?.remainingPoints || 0,
        'X-RateLimit-Reset': rateLimiterRes ? new Date(Date.now() + rateLimiterRes.msBeforeNext) : new Date(Date.now() + 60000),
        'Retry-After': Math.round(rateLimiterRes?.msBeforeNext / 1000) || 60
      });

      res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(rateLimiterRes?.msBeforeNext / 1000) || 60
      });
    });
};

// Authentication rate limiting
const authRateLimit = (req, res, next) => {
  if (!rateLimiters.auth) {
    return next();
  }

  const key = getClientKey(req);
  
  rateLimiters.auth.consume(key)
    .then(() => {
      next();
    })
    .catch((rateLimiterRes) => {
      logger.logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        email: req.body?.email || 'unknown'
      });

      res.set({
        'X-RateLimit-Limit': rateLimiters.auth.points,
        'X-RateLimit-Remaining': rateLimiterRes?.remainingPoints || 0,
        'X-RateLimit-Reset': rateLimiterRes ? new Date(Date.now() + rateLimiterRes.msBeforeNext) : new Date(Date.now() + 900000),
        'Retry-After': Math.round(rateLimiterRes?.msBeforeNext / 1000) || 900
      });

      res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(rateLimiterRes?.msBeforeNext / 1000) || 900
      });
    });
};

// SMS rate limiting
const smsRateLimit = (req, res, next) => {
  if (!rateLimiters.sms) {
    return next();
  }

  const key = req.user ? `user_${req.user._id}` : getClientKey(req);
  const recipientsCount = req.body?.recipients ? req.body.recipients.length : 1;
  
  rateLimiters.sms.consume(key, recipientsCount)
    .then((rateLimiterRes) => {
      res.set({
        'X-SMS-RateLimit-Limit': rateLimiters.sms.points,
        'X-SMS-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-SMS-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext)
      });
      
      next();
    })
    .catch((rateLimiterRes) => {
      logger.logSecurityEvent('SMS_RATE_LIMIT_EXCEEDED', {
        userId: req.user?._id,
        email: req.user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        recipientsCount,
        remainingPoints: rateLimiterRes?.remainingPoints || 0
      });

      res.set({
        'X-SMS-RateLimit-Limit': rateLimiters.sms.points,
        'X-SMS-RateLimit-Remaining': rateLimiterRes?.remainingPoints || 0,
        'X-SMS-RateLimit-Reset': rateLimiterRes ? new Date(Date.now() + rateLimiterRes.msBeforeNext) : new Date(Date.now() + 3600000),
        'Retry-After': Math.round(rateLimiterRes?.msBeforeNext / 1000) || 3600
      });

      res.status(429).json({
        error: 'SMS rate limit exceeded. Please try again later.',
        code: 'SMS_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(rateLimiterRes?.msBeforeNext / 1000) || 3600,
        recipientsRequested: recipientsCount,
        remainingQuota: rateLimiterRes?.remainingPoints || 0
      });
    });
};

// API rate limiting (for high-volume endpoints)
const apiRateLimit = (req, res, next) => {
  if (!rateLimiters.api) {
    return next();
  }

  const key = req.user ? `api_user_${req.user._id}` : `api_${getClientKey(req)}`;
  
  rateLimiters.api.consume(key)
    .then((rateLimiterRes) => {
      res.set({
        'X-API-RateLimit-Limit': rateLimiters.api.points,
        'X-API-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-API-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext)
      });
      
      next();
    })
    .catch((rateLimiterRes) => {
      logger.logSecurityEvent('API_RATE_LIMIT_EXCEEDED', {
        userId: req.user?._id,
        email: req.user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        remainingPoints: rateLimiterRes?.remainingPoints || 0
      });

      res.set({
        'X-API-RateLimit-Limit': rateLimiters.api.points,
        'X-API-RateLimit-Remaining': rateLimiterRes?.remainingPoints || 0,
        'X-API-RateLimit-Reset': rateLimiterRes ? new Date(Date.now() + rateLimiterRes.msBeforeNext) : new Date(Date.now() + 300000),
        'Retry-After': Math.round(rateLimiterRes?.msBeforeNext / 1000) || 300
      });

      res.status(429).json({
        error: 'API rate limit exceeded. Please try again later.',
        code: 'API_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(rateLimiterRes?.msBeforeNext / 1000) || 300
      });
    });
};

// Dynamic rate limiting based on user tier
const dynamicRateLimit = (basePoints = 100, premiumMultiplier = 5) => {
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userTier = req.user.tier || 'basic';
    let points = basePoints;

    switch (userTier) {
      case 'premium':
        points *= premiumMultiplier;
        break;
      case 'enterprise':
        points *= premiumMultiplier * 2;
        break;
      case 'unlimited':
        return next(); // No rate limiting for unlimited tier
      default:
        points = basePoints;
    }

    const rateLimiter = new RateLimiterMemory({
      points,
      duration: 3600, // 1 hour
      blockDuration: 300 // 5 minutes
    });

    const key = `dynamic_${req.user._id}`;

    rateLimiter.consume(key)
      .then((rateLimiterRes) => {
        res.set({
          'X-Dynamic-RateLimit-Limit': points,
          'X-Dynamic-RateLimit-Remaining': rateLimiterRes.remainingPoints,
          'X-Dynamic-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext)
        });
        
        next();
      })
      .catch((rateLimiterRes) => {
        logger.logSecurityEvent('DYNAMIC_RATE_LIMIT_EXCEEDED', {
          userId: req.user._id,
          email: req.user.email,
          tier: userTier,
          limit: points,
          ip: req.ip
        });

        res.status(429).json({
          error: `Rate limit exceeded for ${userTier} tier. Consider upgrading your plan.`,
          code: 'DYNAMIC_RATE_LIMIT_EXCEEDED',
          tier: userTier,
          limit: points,
          retryAfter: Math.round(rateLimiterRes?.msBeforeNext / 1000) || 300
        });
      });
  };
};

// Helper function to get client identifier
const getClientKey = (req) => {
  // Use user ID if available, otherwise use IP + User Agent hash
  if (req.user) {
    return `user_${req.user._id}`;
  }
  
  const userAgent = req.get('User-Agent') || 'unknown';
  const clientKey = `${req.ip}_${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
  return clientKey;
};

// Reset rate limit for a specific key (admin function)
const resetRateLimit = async (type, key) => {
  try {
    if (rateLimiters[type]) {
      await rateLimiters[type].delete(key);
      logger.info(`Rate limit reset for ${type}:${key}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error resetting rate limit for ${type}:${key}`, error);
    return false;
  }
};

// Get rate limit status for a key
const getRateLimitStatus = async (type, key) => {
  try {
    if (rateLimiters[type]) {
      const status = await rateLimiters[type].get(key);
      return {
        points: rateLimiters[type].points,
        remainingPoints: status ? status.remainingPoints : rateLimiters[type].points,
        msBeforeNext: status ? status.msBeforeNext : 0,
        totalHits: status ? status.totalHits : 0
      };
    }
    return null;
  } catch (error) {
    logger.error(`Error getting rate limit status for ${type}:${key}`, error);
    return null;
  }
};

module.exports = {
  rateLimitMiddleware,
  authRateLimit,
  smsRateLimit,
  apiRateLimit,
  dynamicRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  initializeRateLimiters
};