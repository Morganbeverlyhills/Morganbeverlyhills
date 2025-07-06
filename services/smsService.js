const twilio = require('twilio');
const Bull = require('bull');
const Redis = require('redis');
const logger = require('../utils/logger');
const blockchainService = require('./blockchainService');

class SMSService {
  constructor() {
    this.client = null;
    this.smsQueue = null;
    this.statusQueue = null;
    this.isInitialized = false;
    this.redis = null;
  }

  async initialize() {
    try {
      // Initialize Twilio client
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        this.client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        
        // Test Twilio connection
        await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        logger.info('Twilio client initialized successfully');
      } else {
        logger.warn('Twilio credentials not provided, SMS service will run in mock mode');
      }

      // Initialize Redis for queues
      this.redis = Redis.createClient({
        host: process.env.QUEUE_REDIS_HOST || 'localhost',
        port: process.env.QUEUE_REDIS_PORT || 6379,
        password: process.env.QUEUE_REDIS_PASSWORD || undefined
      });

      await this.redis.connect();

      // Initialize Bull queues for SMS processing
      this.smsQueue = new Bull('sms queue', {
        redis: {
          host: process.env.QUEUE_REDIS_HOST || 'localhost',
          port: process.env.QUEUE_REDIS_PORT || 6379,
          password: process.env.QUEUE_REDIS_PASSWORD || undefined
        }
      });

      this.statusQueue = new Bull('status queue', {
        redis: {
          host: process.env.QUEUE_REDIS_HOST || 'localhost',
          port: process.env.QUEUE_REDIS_PORT || 6379,
          password: process.env.QUEUE_REDIS_PASSWORD || undefined
        }
      });

      // Set up queue processors
      this.setupQueueProcessors();

      this.isInitialized = true;
      logger.info('SMS service initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
      // Don't throw error to allow app to start without SMS in development
    }
  }

  setupQueueProcessors() {
    // SMS sending processor
    this.smsQueue.process('sendSMS', 10, async (job) => {
      const { campaignId, recipient, message, deliveryId, userId } = job.data;
      
      try {
        const result = await this.sendSingleSMS(recipient, message, deliveryId);
        
        // Log to blockchain if successful
        if (result.success && blockchainService.isReady()) {
          try {
            await blockchainService.logMessage(campaignId, recipient, message, deliveryId);
          } catch (blockchainError) {
            logger.error('Failed to log message to blockchain:', blockchainError);
          }
        }

        // Update status in blockchain
        if (result.messageId) {
          await this.statusQueue.add('updateStatus', {
            messageId: result.messageId,
            status: result.success ? 'SENT' : 'FAILED',
            deliveryId
          }, {
            delay: 5000 // Wait 5 seconds before updating status
          });
        }

        logger.logSMS({
          campaignId,
          messageId: result.messageId,
          recipient,
          status: result.success ? 'SENT' : 'FAILED',
          cost: result.cost,
          deliveryId
        }, result.success);

        return result;
        
      } catch (error) {
        logger.error('Error in SMS queue processor:', error);
        throw error;
      }
    });

    // Status update processor
    this.statusQueue.process('updateStatus', async (job) => {
      const { messageId, status, deliveryId } = job.data;
      
      try {
        if (blockchainService.isReady() && messageId) {
          await blockchainService.updateMessageStatus(messageId, status);
        }
        
        logger.info(`Updated message ${messageId} status to ${status}`);
        
      } catch (error) {
        logger.error('Error updating message status:', error);
        throw error;
      }
    });

    // Queue event handlers
    this.smsQueue.on('completed', (job, result) => {
      logger.info(`SMS job ${job.id} completed:`, result);
    });

    this.smsQueue.on('failed', (job, err) => {
      logger.error(`SMS job ${job.id} failed:`, err);
    });

    this.statusQueue.on('completed', (job, result) => {
      logger.info(`Status update job ${job.id} completed`);
    });

    this.statusQueue.on('failed', (job, err) => {
      logger.error(`Status update job ${job.id} failed:`, err);
    });
  }

  async sendSingleSMS(recipient, message, deliveryId = null) {
    try {
      if (!this.client) {
        // Mock mode for development
        logger.info(`Mock SMS sent to ${recipient}: ${message}`);
        return {
          success: true,
          messageId: `mock_${Date.now()}`,
          cost: 0.01,
          deliveryId: deliveryId || `mock_${Date.now()}`,
          provider: 'mock'
        };
      }

      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: recipient,
        statusCallback: `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhooks/sms-status`,
        ...(deliveryId && { clientReference: deliveryId })
      });

      return {
        success: true,
        messageId: result.sid,
        cost: parseFloat(result.price) || 0.01,
        deliveryId: deliveryId || result.sid,
        provider: 'twilio',
        status: result.status
      };
      
    } catch (error) {
      logger.error('Error sending SMS:', error);
      return {
        success: false,
        error: error.message,
        messageId: null,
        cost: 0,
        deliveryId: deliveryId || null,
        provider: 'twilio'
      };
    }
  }

  async sendBulkSMS(campaignId, recipients, message, userId, options = {}) {
    try {
      const {
        batchSize = 50,
        delayBetweenBatches = 1000,
        priority = 'normal'
      } = options;

      if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new Error('Recipients must be a non-empty array');
      }

      if (!message || message.trim().length === 0) {
        throw new Error('Message cannot be empty');
      }

      // Validate phone numbers
      const validRecipients = recipients.filter(phone => this.validatePhoneNumber(phone));
      
      if (validRecipients.length === 0) {
        throw new Error('No valid phone numbers provided');
      }

      logger.info(`Starting bulk SMS campaign ${campaignId} for ${validRecipients.length} recipients`);

      const jobs = [];
      const jobPriority = this.getJobPriority(priority);

      // Process recipients in batches
      for (let i = 0; i < validRecipients.length; i += batchSize) {
        const batch = validRecipients.slice(i, i + batchSize);
        
        for (const recipient of batch) {
          const deliveryId = blockchainService.generateDeliveryId();
          
          const job = await this.smsQueue.add('sendSMS', {
            campaignId,
            recipient,
            message,
            deliveryId,
            userId
          }, {
            priority: jobPriority,
            delay: Math.floor(i / batchSize) * delayBetweenBatches,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            },
            removeOnComplete: 100,
            removeOnFail: 50
          });

          jobs.push({
            jobId: job.id,
            recipient: recipient,
            deliveryId,
            estimatedSendTime: new Date(Date.now() + Math.floor(i / batchSize) * delayBetweenBatches)
          });
        }
      }

      return {
        success: true,
        campaignId,
        totalRecipients: validRecipients.length,
        invalidRecipients: recipients.length - validRecipients.length,
        estimatedDuration: Math.ceil(validRecipients.length / batchSize) * delayBetweenBatches,
        jobs: jobs.map(job => ({
          jobId: job.jobId,
          deliveryId: job.deliveryId,
          estimatedSendTime: job.estimatedSendTime
        }))
      };
      
    } catch (error) {
      logger.error('Error in bulk SMS sending:', error);
      throw error;
    }
  }

  async getCampaignStatus(campaignId) {
    try {
      // Get all jobs for this campaign
      const waiting = await this.smsQueue.getWaiting();
      const active = await this.smsQueue.getActive();
      const completed = await this.smsQueue.getCompleted();
      const failed = await this.smsQueue.getFailed();

      const campaignJobs = {
        waiting: waiting.filter(job => job.data.campaignId === campaignId),
        active: active.filter(job => job.data.campaignId === campaignId),
        completed: completed.filter(job => job.data.campaignId === campaignId),
        failed: failed.filter(job => job.data.campaignId === campaignId)
      };

      const totalJobs = Object.values(campaignJobs).reduce((sum, jobs) => sum + jobs.length, 0);
      
      return {
        campaignId,
        totalMessages: totalJobs,
        waiting: campaignJobs.waiting.length,
        active: campaignJobs.active.length,
        completed: campaignJobs.completed.length,
        failed: campaignJobs.failed.length,
        progress: totalJobs > 0 ? ((campaignJobs.completed.length + campaignJobs.failed.length) / totalJobs) * 100 : 0
      };
      
    } catch (error) {
      logger.error('Error getting campaign status:', error);
      throw error;
    }
  }

  async pauseCampaign(campaignId) {
    try {
      const waiting = await this.smsQueue.getWaiting();
      const campaignJobs = waiting.filter(job => job.data.campaignId === campaignId);
      
      for (const job of campaignJobs) {
        await job.remove();
      }
      
      logger.info(`Paused campaign ${campaignId}, removed ${campaignJobs.length} pending jobs`);
      
      return {
        success: true,
        campaignId,
        removedJobs: campaignJobs.length
      };
      
    } catch (error) {
      logger.error('Error pausing campaign:', error);
      throw error;
    }
  }

  validatePhoneNumber(phoneNumber) {
    // Basic phone number validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  getJobPriority(priority) {
    const priorities = {
      'low': 1,
      'normal': 5,
      'high': 10,
      'urgent': 15
    };
    return priorities[priority] || 5;
  }

  async getQueueStats() {
    try {
      const smsStats = {
        waiting: await this.smsQueue.getWaiting(),
        active: await this.smsQueue.getActive(),
        completed: await this.smsQueue.getCompleted(),
        failed: await this.smsQueue.getFailed()
      };

      const statusStats = {
        waiting: await this.statusQueue.getWaiting(),
        active: await this.statusQueue.getActive(),
        completed: await this.statusQueue.getCompleted(),
        failed: await this.statusQueue.getFailed()
      };

      return {
        sms: {
          waiting: smsStats.waiting.length,
          active: smsStats.active.length,
          completed: smsStats.completed.length,
          failed: smsStats.failed.length,
          total: Object.values(smsStats).reduce((sum, jobs) => sum + jobs.length, 0)
        },
        status: {
          waiting: statusStats.waiting.length,
          active: statusStats.active.length,
          completed: statusStats.completed.length,
          failed: statusStats.failed.length,
          total: Object.values(statusStats).reduce((sum, jobs) => sum + jobs.length, 0)
        }
      };
      
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async handleDeliveryStatus(messageId, status, deliveryId) {
    try {
      // Map Twilio status to our status
      const statusMap = {
        'queued': 'PENDING',
        'sending': 'PENDING',
        'sent': 'SENT',
        'delivered': 'DELIVERED',
        'undelivered': 'FAILED',
        'failed': 'FAILED'
      };

      const mappedStatus = statusMap[status.toLowerCase()] || 'FAILED';

      // Update blockchain if available
      if (blockchainService.isReady()) {
        // Find the blockchain message ID by delivery ID
        // This would need to be implemented based on your data structure
        await this.statusQueue.add('updateStatus', {
          messageId,
          status: mappedStatus,
          deliveryId
        });
      }

      logger.logSMS({
        messageId,
        deliveryId,
        status: mappedStatus
      });

      return {
        success: true,
        messageId,
        status: mappedStatus
      };
      
    } catch (error) {
      logger.error('Error handling delivery status:', error);
      throw error;
    }
  }

  isReady() {
    return this.isInitialized;
  }

  async cleanup() {
    try {
      if (this.smsQueue) {
        await this.smsQueue.close();
      }
      if (this.statusQueue) {
        await this.statusQueue.close();
      }
      if (this.redis) {
        await this.redis.quit();
      }
      logger.info('SMS service cleanup completed');
    } catch (error) {
      logger.error('Error during SMS service cleanup:', error);
    }
  }
}

module.exports = new SMSService();