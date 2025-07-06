const logger = require('../utils/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class BlockchainError extends AppError {
  constructor(message, details = null) {
    super(message, 500, 'BLOCKCHAIN_ERROR', details);
    this.name = 'BlockchainError';
  }
}

class SMSError extends AppError {
  constructor(message, details = null) {
    super(message, 500, 'SMS_ERROR', details);
    this.name = 'SMSError';
  }
}

// Error handler middleware
const errorHandler = (error, req, res, next) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details = null;

  // Log error details
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // Handle different error types
  if (error.isOperational) {
    // Operational errors (expected errors)
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;
    details = error.details;
    
    if (statusCode >= 500) {
      logger.error('Operational Error (5xx):', errorInfo);
    } else {
      logger.warn('Operational Error (4xx):', errorInfo);
    }
  } else {
    // Programming errors (unexpected errors)
    logger.error('Programming Error:', errorInfo);
    
    // Handle specific error types
    if (error.name === 'ValidationError' && error.errors) {
      // Mongoose validation error
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
    } else if (error.name === 'CastError' && error.kind === 'ObjectId') {
      // Invalid MongoDB ObjectId
      statusCode = 400;
      code = 'INVALID_ID';
      message = 'Invalid ID format';
    } else if (error.code === 11000) {
      // MongoDB duplicate key error
      statusCode = 400;
      code = 'DUPLICATE_ENTRY';
      message = 'Duplicate entry';
      
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      details = { field, value, message: `${field} '${value}' already exists` };
    } else if (error.name === 'JsonWebTokenError') {
      // JWT errors
      statusCode = 401;
      code = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      code = 'TOKEN_EXPIRED';
      message = 'Authentication token expired';
    } else if (error.name === 'SyntaxError' && error.status === 400) {
      // JSON parsing error
      statusCode = 400;
      code = 'INVALID_JSON';
      message = 'Invalid JSON in request body';
    } else if (error.type === 'entity.too.large') {
      // Request too large
      statusCode = 413;
      code = 'REQUEST_TOO_LARGE';
      message = 'Request entity too large';
    } else if (error.code === 'ECONNREFUSED') {
      // Database connection error
      statusCode = 503;
      code = 'SERVICE_UNAVAILABLE';
      message = 'Service temporarily unavailable';
    } else if (error.code === 'ETIMEDOUT') {
      // Timeout error
      statusCode = 504;
      code = 'GATEWAY_TIMEOUT';
      message = 'Request timeout';
    }
    
    // In production, don't expose internal error details
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
      message = 'Internal server error';
      details = null;
    }
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || generateRequestId()
    }
  };

  // Add details if available and not in production for 5xx errors
  if (details && !(process.env.NODE_ENV === 'production' && statusCode >= 500)) {
    errorResponse.error.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);

  // Log security-related errors
  if (statusCode === 401 || statusCode === 403) {
    logger.logSecurityEvent('SECURITY_ERROR', {
      statusCode,
      message,
      code,
      ...errorInfo
    });
  }

  // Emit error event for monitoring (optional)
  if (req.app && typeof req.app.emit === 'function') {
    req.app.emit('error', {
      error,
      statusCode,
      code,
      requestId: errorResponse.error.requestId
    });
  }
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
  next(error);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error handler
const validationErrorHandler = (validationResult) => {
  return (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const details = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      }));
      
      throw new ValidationError('Validation failed', details);
    }
    
    next();
  };
};

// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason.toString(),
    stack: reason.stack,
    promise: promise.toString()
  });
  
  // Don't exit in production, just log
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Global uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack
  });
  
  // Always exit on uncaught exceptions
  process.exit(1);
});

// Generate unique request ID
const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Rate limit error handler
const rateLimitErrorHandler = (req, res, next) => {
  if (res.statusCode === 429) {
    const error = new AppError(
      'Too many requests, please try again later',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
    return next(error);
  }
  next();
};

// Database error handler
const databaseErrorHandler = (error, req, res, next) => {
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      const newError = new ValidationError(
        `${field} '${value}' already exists`,
        { field, value }
      );
      return next(newError);
    }
    
    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));
      
      const newError = new ValidationError('Validation failed', details);
      return next(newError);
    }
    
    // Generic database error
    const newError = new AppError(
      'Database operation failed',
      500,
      'DATABASE_ERROR'
    );
    return next(newError);
  }
  
  next(error);
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  BlockchainError,
  SMSError,
  
  // Middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validationErrorHandler,
  rateLimitErrorHandler,
  databaseErrorHandler
};