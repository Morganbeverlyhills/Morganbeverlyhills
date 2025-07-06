const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  // Basic information
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true,
    maxlength: [100, 'Campaign name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Owner information
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Blockchain integration
  blockchainCampaignId: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Campaign status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'failed'],
    default: 'draft',
    index: true
  },
  
  // Message content
  messageTemplate: {
    content: {
      type: String,
      required: [true, 'Message content is required'],
      maxlength: [1600, 'Message cannot exceed 1600 characters'] // SMS limit
    },
    variables: [{
      name: String,
      defaultValue: String,
      description: String
    }]
  },
  
  // Recipients
  recipients: {
    total: {
      type: Number,
      default: 0,
      min: 0
    },
    valid: {
      type: Number,
      default: 0,
      min: 0
    },
    invalid: {
      type: Number,
      default: 0,
      min: 0
    },
    // Store recipients in separate collection for large campaigns
    source: {
      type: String,
      enum: ['manual', 'file', 'api', 'database'],
      default: 'manual'
    },
    list: [{
      phoneNumber: {
        type: String,
        required: true,
        match: [/^\+[1-9]\d{1,14}$/, 'Invalid phone number format']
      },
      variables: {
        type: Map,
        of: String
      },
      isValid: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // Scheduling
  scheduling: {
    type: {
      type: String,
      enum: ['immediate', 'scheduled', 'recurring'],
      default: 'immediate'
    },
    scheduledAt: Date,
    timezone: {
      type: String,
      default: 'UTC'
    },
    recurring: {
      enabled: {
        type: Boolean,
        default: false
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'weekly'
      },
      interval: {
        type: Number,
        default: 1,
        min: 1
      },
      endDate: Date,
      maxOccurrences: Number
    }
  },
  
  // Delivery settings
  delivery: {
    batchSize: {
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    },
    delayBetweenBatches: {
      type: Number,
      default: 1000, // milliseconds
      min: 100
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    retryFailures: {
      type: Boolean,
      default: true
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 5
    }
  },
  
  // Statistics and tracking
  statistics: {
    totalMessages: {
      type: Number,
      default: 0
    },
    sent: {
      type: Number,
      default: 0
    },
    delivered: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    },
    clicked: {
      type: Number,
      default: 0
    },
    opted_out: {
      type: Number,
      default: 0
    }
  },
  
  // Cost tracking
  cost: {
    estimated: {
      type: Number,
      default: 0
    },
    actual: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  
  // Time tracking
  timing: {
    startedAt: Date,
    completedAt: Date,
    duration: Number, // in milliseconds
    lastActivityAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Configuration
  settings: {
    allowDuplicates: {
      type: Boolean,
      default: false
    },
    respectOptOuts: {
      type: Boolean,
      default: true
    },
    enableDeliveryReports: {
      type: Boolean,
      default: true
    },
    enableClickTracking: {
      type: Boolean,
      default: false
    },
    customSender: String,
    webhookUrl: String
  },
  
  // Error tracking
  errors: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    error: String,
    count: {
      type: Number,
      default: 1
    },
    lastOccurrence: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Tags and categorization
  tags: [{
    type: String,
    trim: true
  }],
  
  category: {
    type: String,
    enum: ['marketing', 'transactional', 'notification', 'alert', 'reminder', 'other'],
    default: 'other'
  },
  
  // Metadata
  metadata: {
    source: {
      type: String,
      enum: ['web', 'api', 'import'],
      default: 'web'
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template'
    },
    notes: String,
    internalRef: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
campaignSchema.index({ owner: 1, status: 1 });
campaignSchema.index({ status: 1, 'scheduling.scheduledAt': 1 });
campaignSchema.index({ 'timing.startedAt': 1 });
campaignSchema.index({ 'timing.completedAt': 1 });
campaignSchema.index({ category: 1 });
campaignSchema.index({ tags: 1 });
campaignSchema.index({ createdAt: -1 });

// Virtual properties
campaignSchema.virtual('deliveryRate').get(function() {
  if (this.statistics.sent === 0) return 0;
  return Math.round((this.statistics.delivered / this.statistics.sent) * 100);
});

campaignSchema.virtual('failureRate').get(function() {
  if (this.statistics.totalMessages === 0) return 0;
  return Math.round((this.statistics.failed / this.statistics.totalMessages) * 100);
});

campaignSchema.virtual('progress').get(function() {
  if (this.statistics.totalMessages === 0) return 0;
  const completed = this.statistics.sent + this.statistics.failed;
  return Math.round((completed / this.statistics.totalMessages) * 100);
});

campaignSchema.virtual('estimatedCompletion').get(function() {
  if (this.status !== 'active' || this.statistics.sent === 0) return null;
  
  const timeElapsed = Date.now() - this.timing.startedAt.getTime();
  const messagesPerMs = this.statistics.sent / timeElapsed;
  const remainingMessages = this.statistics.totalMessages - this.statistics.sent;
  
  if (messagesPerMs === 0) return null;
  
  return new Date(Date.now() + (remainingMessages / messagesPerMs));
});

// Instance methods
campaignSchema.methods.updateStatistics = function() {
  this.statistics.totalMessages = this.recipients.total;
  this.statistics.pending = this.statistics.totalMessages - 
    (this.statistics.sent + this.statistics.failed);
  
  this.timing.lastActivityAt = new Date();
  
  // Update completion status
  if (this.statistics.pending === 0 && this.status === 'active') {
    this.status = 'completed';
    this.timing.completedAt = new Date();
    this.timing.duration = this.timing.completedAt.getTime() - this.timing.startedAt.getTime();
  }
  
  return this.save();
};

campaignSchema.methods.start = function() {
  if (this.status !== 'scheduled' && this.status !== 'draft') {
    throw new Error(`Cannot start campaign with status: ${this.status}`);
  }
  
  this.status = 'active';
  this.timing.startedAt = new Date();
  this.timing.lastActivityAt = new Date();
  
  return this.save();
};

campaignSchema.methods.pause = function() {
  if (this.status !== 'active') {
    throw new Error(`Cannot pause campaign with status: ${this.status}`);
  }
  
  this.status = 'paused';
  this.timing.lastActivityAt = new Date();
  
  return this.save();
};

campaignSchema.methods.resume = function() {
  if (this.status !== 'paused') {
    throw new Error(`Cannot resume campaign with status: ${this.status}`);
  }
  
  this.status = 'active';
  this.timing.lastActivityAt = new Date();
  
  return this.save();
};

campaignSchema.methods.cancel = function() {
  if (['completed', 'cancelled', 'failed'].includes(this.status)) {
    throw new Error(`Cannot cancel campaign with status: ${this.status}`);
  }
  
  this.status = 'cancelled';
  this.timing.completedAt = new Date();
  this.timing.lastActivityAt = new Date();
  
  if (this.timing.startedAt) {
    this.timing.duration = this.timing.completedAt.getTime() - this.timing.startedAt.getTime();
  }
  
  return this.save();
};

campaignSchema.methods.addRecipients = function(recipients) {
  if (!Array.isArray(recipients)) {
    throw new Error('Recipients must be an array');
  }
  
  const validRecipients = recipients.filter(r => {
    return r.phoneNumber && /^\+[1-9]\d{1,14}$/.test(r.phoneNumber);
  });
  
  this.recipients.list.push(...validRecipients);
  this.recipients.total = this.recipients.list.length;
  this.recipients.valid = validRecipients.length;
  this.recipients.invalid = recipients.length - validRecipients.length;
  
  return this.save();
};

campaignSchema.methods.removeRecipient = function(phoneNumber) {
  this.recipients.list = this.recipients.list.filter(r => r.phoneNumber !== phoneNumber);
  this.recipients.total = this.recipients.list.length;
  
  return this.save();
};

campaignSchema.methods.logError = function(error) {
  const existingError = this.errors.find(e => e.error === error);
  
  if (existingError) {
    existingError.count += 1;
    existingError.lastOccurrence = new Date();
  } else {
    this.errors.push({
      error,
      timestamp: new Date(),
      count: 1,
      lastOccurrence: new Date()
    });
  }
  
  return this.save();
};

campaignSchema.methods.canBeModified = function() {
  return ['draft', 'scheduled', 'paused'].includes(this.status);
};

campaignSchema.methods.canBeStarted = function() {
  return ['draft', 'scheduled'].includes(this.status) && 
         this.recipients.total > 0 && 
         this.messageTemplate.content;
};

campaignSchema.methods.canBePaused = function() {
  return this.status === 'active';
};

campaignSchema.methods.toSummary = function() {
  return {
    id: this._id,
    name: this.name,
    status: this.status,
    recipients: this.recipients.total,
    deliveryRate: this.deliveryRate,
    progress: this.progress,
    createdAt: this.createdAt,
    startedAt: this.timing.startedAt,
    completedAt: this.timing.completedAt
  };
};

// Static methods
campaignSchema.statics.findByOwner = function(ownerId, status = null) {
  const query = { owner: ownerId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

campaignSchema.statics.findScheduled = function() {
  return this.find({
    status: 'scheduled',
    'scheduling.scheduledAt': { $lte: new Date() }
  });
};

campaignSchema.statics.findActive = function() {
  return this.find({ status: 'active' });
};

campaignSchema.statics.getStatsByOwner = function(ownerId) {
  return this.aggregate([
    { $match: { owner: mongoose.Types.ObjectId(ownerId) } },
    {
      $group: {
        _id: '$owner',
        totalCampaigns: { $sum: 1 },
        activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        completedCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        totalMessages: { $sum: '$statistics.totalMessages' },
        totalSent: { $sum: '$statistics.sent' },
        totalDelivered: { $sum: '$statistics.delivered' },
        totalFailed: { $sum: '$statistics.failed' },
        totalCost: { $sum: '$cost.actual' }
      }
    }
  ]);
};

module.exports = mongoose.model('Campaign', campaignSchema);