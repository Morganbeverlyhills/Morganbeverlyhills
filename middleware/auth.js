const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No valid token provided.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      logger.logSecurityEvent('INVALID_USER_TOKEN', {
        userId: decoded.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({ 
        error: 'User not found.',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      logger.logSecurityEvent('INACTIVE_USER_ACCESS', {
        userId: user._id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({ 
        error: 'Account is deactivated.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check if user is verified (if email verification is required)
    if (!user.isEmailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
      return res.status(401).json({ 
        error: 'Email verification required.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Add user to request object
    req.user = user;
    
    // Update last active timestamp
    user.lastActive = new Date();
    await user.save();

    next();
    
  } catch (error) {
    logger.logSecurityEvent('AUTH_ERROR', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      token: req.header('Authorization') ? 'provided' : 'missing'
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired.',
        code: 'TOKEN_EXPIRED'
      });
    }

    logger.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal server error during authentication.',
      code: 'AUTH_SERVER_ERROR'
    });
  }
};

// Admin role middleware
const adminMiddleware = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.user.role !== 'admin') {
      logger.logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({ 
        error: 'Admin access required.',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
    
  } catch (error) {
    logger.error('Admin middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal server error during authorization.',
      code: 'ADMIN_SERVER_ERROR'
    });
  }
};

// API key middleware (for external integrations)
const apiKeyMiddleware = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required.',
        code: 'API_KEY_REQUIRED'
      });
    }

    // Find user by API key
    const user = await User.findOne({ apiKey: apiKey, isActive: true }).select('-password');
    
    if (!user) {
      logger.logSecurityEvent('INVALID_API_KEY', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({ 
        error: 'Invalid API key.',
        code: 'INVALID_API_KEY'
      });
    }

    // Check API key usage limits
    if (user.apiKeyUsage && user.apiKeyUsage.monthlyLimit) {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      if (user.apiKeyUsage.month === currentMonth && 
          user.apiKeyUsage.year === currentYear && 
          user.apiKeyUsage.count >= user.apiKeyUsage.monthlyLimit) {
        
        return res.status(429).json({ 
          error: 'API key monthly limit exceeded.',
          code: 'API_LIMIT_EXCEEDED'
        });
      }
    }

    // Add user to request object
    req.user = user;
    req.authMethod = 'apiKey';
    
    // Update API key usage
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'apiKeyUsage.count': 1 },
      $set: { 
        'apiKeyUsage.month': new Date().getMonth(),
        'apiKeyUsage.year': new Date().getFullYear(),
        lastActive: new Date()
      }
    });

    next();
    
  } catch (error) {
    logger.error('API key middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal server error during API key validation.',
      code: 'API_KEY_SERVER_ERROR'
    });
  }
};

// Conditional auth middleware (allows both JWT and API key)
const conditionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const apiKey = req.header('X-API-Key');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Use JWT authentication
    return authMiddleware(req, res, next);
  } else if (apiKey) {
    // Use API key authentication
    return apiKeyMiddleware(req, res, next);
  } else {
    return res.status(401).json({ 
      error: 'Authentication required. Provide either Bearer token or API key.',
      code: 'AUTH_REQUIRED'
    });
  }
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(time => time > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId);
    
    if (userRequests.length >= maxRequests) {
      logger.logSecurityEvent('USER_RATE_LIMIT_EXCEEDED', {
        userId: req.user._id,
        email: req.user.email,
        requests: userRequests.length,
        limit: maxRequests,
        ip: req.ip
      });
      
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(userId, userRequests);
    
    next();
  };
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  apiKeyMiddleware,
  conditionalAuth,
  userRateLimit
};