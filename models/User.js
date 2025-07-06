const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic information
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number in E.164 format']
  },
  
  company: {
    type: String,
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters']
  },
  
  // Account status and verification
  isActive: {
    type: Boolean,
    default: true
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  // Role and permissions
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  
  permissions: [{
    type: String,
    enum: [
      'sms:send',
      'sms:bulk',
      'campaign:create',
      'campaign:manage',
      'admin:users',
      'admin:system',
      'blockchain:read',
      'blockchain:write'
    ]
  }],
  
  // Subscription and billing
  tier: {
    type: String,
    enum: ['basic', 'premium', 'enterprise', 'unlimited'],
    default: 'basic'
  },
  
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise', 'custom'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'cancelled'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date,
    autoRenew: {
      type: Boolean,
      default: false
    }
  },
  
  // Billing information
  billing: {
    customerId: String, // Stripe customer ID or similar
    paymentMethod: String,
    billingAddress: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },
  
  // SMS credits and usage
  credits: {
    balance: {
      type: Number,
      default: 10, // Free credits for new users
      min: 0
    },
    totalPurchased: {
      type: Number,
      default: 0,
      min: 0
    },
    totalUsed: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // API access
  apiKey: {
    type: String,
    unique: true,
    sparse: true,
    select: false
  },
  
  apiKeyUsage: {
    count: {
      type: Number,
      default: 0
    },
    monthlyLimit: {
      type: Number,
      default: 1000
    },
    month: Number,
    year: Number
  },
  
  // Blockchain integration
  walletAddress: {
    type: String,
    trim: true,
    match: [/^0x[a-fA-F0-9]{40}$/, 'Please enter a valid Ethereum wallet address'],
    sparse: true,
    unique: true
  },
  
  blockchainCredits: {
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Security
  twoFactorAuth: {
    enabled: {
      type: Boolean,
      default: false
    },
    secret: {
      type: String,
      select: false
    },
    backupCodes: [{
      type: String,
      select: false
    }]
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  passwordChangedAt: Date,
  
  loginAttempts: {
    count: {
      type: Number,
      default: 0
    },
    lastAttempt: Date,
    lockedUntil: Date
  },
  
  // Usage statistics
  statistics: {
    totalCampaigns: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    lastCampaignDate: Date
  },
  
  // Activity tracking
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  lastLogin: Date,
  
  ipAddresses: [{
    ip: String,
    userAgent: String,
    location: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Preferences
  preferences: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    emailNotifications: {
      campaignUpdates: {
        type: Boolean,
        default: true
      },
      securityAlerts: {
        type: Boolean,
        default: true
      },
      billing: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    dashboard: {
      defaultView: {
        type: String,
        enum: ['overview', 'campaigns', 'analytics', 'credits'],
        default: 'overview'
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto'
      }
    }
  },
  
  // Metadata
  metadata: {
    referralCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    source: {
      type: String,
      enum: ['web', 'api', 'referral', 'admin'],
      default: 'web'
    },
    notes: String // Admin notes
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ apiKey: 1 });
userSchema.index({ walletAddress: 1 });
userSchema.index({ 'subscription.status': 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ lastActive: 1 });
userSchema.index({ createdAt: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account status
userSchema.virtual('accountStatus').get(function() {
  if (!this.isActive) return 'disabled';
  if (!this.isEmailVerified) return 'unverified';
  if (this.subscription.status !== 'active') return 'suspended';
  return 'active';
});

// Virtual for credit usage percentage
userSchema.virtual('creditUsagePercentage').get(function() {
  if (this.credits.totalPurchased === 0) return 0;
  return Math.round((this.credits.totalUsed / this.credits.totalPurchased) * 100);
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Hash password if it's modified
  if (this.isModified('password')) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    this.passwordChangedAt = new Date();
  }
  
  // Generate API key if not exists
  if (this.isNew && !this.apiKey) {
    this.apiKey = this.generateApiKey();
  }
  
  // Generate referral code if not exists
  if (this.isNew && !this.metadata.referralCode) {
    this.metadata.referralCode = this.generateReferralCode();
  }
  
  next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateApiKey = function() {
  const prefix = 'bsms_'; // blockchain sms prefix
  const randomPart = crypto.randomBytes(32).toString('hex');
  return prefix + randomPart;
};

userSchema.methods.generateReferralCode = function() {
  const name = (this.firstName + this.lastName).replace(/[^a-zA-Z]/g, '').toLowerCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return (name.substring(0, 6) + random).toUpperCase();
};

userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return token;
};

userSchema.methods.deductCredits = function(amount) {
  if (this.credits.balance < amount) {
    throw new Error('Insufficient credits');
  }
  this.credits.balance -= amount;
  this.credits.totalUsed += amount;
  return this.credits.balance;
};

userSchema.methods.addCredits = function(amount) {
  this.credits.balance += amount;
  this.credits.totalPurchased += amount;
  return this.credits.balance;
};

userSchema.methods.isAccountLocked = function() {
  return !!(this.loginAttempts.lockedUntil && this.loginAttempts.lockedUntil > Date.now());
};

userSchema.methods.incrementLoginAttempts = function() {
  // Reset attempts if last attempt was more than 2 hours ago
  if (this.loginAttempts.lastAttempt && 
      Date.now() - this.loginAttempts.lastAttempt > 2 * 60 * 60 * 1000) {
    this.loginAttempts.count = 0;
  }
  
  this.loginAttempts.count += 1;
  this.loginAttempts.lastAttempt = Date.now();
  
  // Lock account after 5 failed attempts
  if (this.loginAttempts.count >= 5) {
    this.loginAttempts.lockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
  }
  
  return this.save();
};

userSchema.methods.resetLoginAttempts = function() {
  this.loginAttempts = {
    count: 0,
    lastAttempt: undefined,
    lockedUntil: undefined
  };
  return this.save();
};

userSchema.methods.updateLastActive = function(ip, userAgent) {
  this.lastActive = new Date();
  this.lastLogin = new Date();
  
  // Add IP address to history (keep only last 10)
  this.ipAddresses.unshift({
    ip,
    userAgent,
    timestamp: new Date()
  });
  
  if (this.ipAddresses.length > 10) {
    this.ipAddresses = this.ipAddresses.slice(0, 10);
  }
  
  return this.save();
};

userSchema.methods.hasPermission = function(permission) {
  if (this.role === 'admin') return true;
  return this.permissions.includes(permission);
};

userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.apiKey;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.twoFactorAuth.secret;
  delete obj.twoFactorAuth.backupCodes;
  return obj;
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByApiKey = function(apiKey) {
  return this.findOne({ apiKey }).select('+apiKey');
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true, isEmailVerified: true });
};

module.exports = mongoose.model('User', userSchema);