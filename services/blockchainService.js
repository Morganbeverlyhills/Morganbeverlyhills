const { ethers } = require('ethers');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Import contract ABI (this would be generated after compilation)
const contractABI = [
  "function createCampaign(string memory name, string memory description) external returns (uint256)",
  "function logMessage(uint256 campaignId, string memory recipientHash, string memory messageHash, string memory deliveryId) external returns (uint256)",
  "function updateMessageStatus(uint256 messageId, uint8 status) external",
  "function addCredits(address user, uint256 amount) external",
  "function purchaseCredits() external payable",
  "function getCampaign(uint256 campaignId) external view returns (tuple(uint256 id, address owner, string name, string description, uint256 totalMessages, uint256 sentMessages, uint256 deliveredMessages, uint256 failedMessages, uint256 totalCost, uint256 createdAt, uint8 status))",
  "function getMessage(uint256 messageId) external view returns (tuple(uint256 id, uint256 campaignId, address sender, string recipientHash, string messageHash, uint256 timestamp, uint8 status, uint256 cost, string deliveryId))",
  "function getUserCredits(address user) external view returns (tuple(uint256 balance, uint256 totalSpent, uint256 totalMessages, bool isActive))",
  "function getTotalCampaigns() external view returns (uint256)",
  "function getTotalMessages() external view returns (uint256)",
  "function addAuthorizedSender(address sender) external",
  "function removeAuthorizedSender(address sender) external",
  "function pause() external",
  "function unpause() external",
  "function withdraw() external",
  "event CampaignCreated(uint256 indexed campaignId, address indexed owner, string name)",
  "event MessageLogged(uint256 indexed messageId, uint256 indexed campaignId, address indexed sender)",
  "event MessageStatusUpdated(uint256 indexed messageId, uint8 status)",
  "event CreditsAdded(address indexed user, uint256 amount)",
  "event CreditsPurchased(address indexed user, uint256 amount, uint256 cost)"
];

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Connect to blockchain provider
      const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Test connection
      await this.provider.getNetwork();
      logger.info('Connected to blockchain network');

      // Initialize wallet if private key is provided
      if (process.env.PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        logger.info(`Wallet initialized: ${this.wallet.address}`);
      }

      // Initialize contract if address is provided
      if (process.env.CONTRACT_ADDRESS && this.wallet) {
        this.contract = new ethers.Contract(
          process.env.CONTRACT_ADDRESS,
          contractABI,
          this.wallet
        );
        
        // Test contract connection
        await this.contract.getTotalCampaigns();
        logger.info(`Contract initialized: ${process.env.CONTRACT_ADDRESS}`);
      }

      this.isInitialized = true;
      logger.info('Blockchain service initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  // Utility functions
  hashPhoneNumber(phoneNumber) {
    return crypto.createHash('sha256').update(phoneNumber).digest('hex');
  }

  hashMessage(message) {
    return crypto.createHash('sha256').update(message).digest('hex');
  }

  generateDeliveryId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Campaign management
  async createCampaign(name, description, userAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await this.contract.createCampaign(name, description);
      const receipt = await tx.wait();
      
      // Parse the event to get the campaign ID
      const event = receipt.logs.find(log => {
        try {
          return this.contract.interface.parseLog(log).name === 'CampaignCreated';
        } catch {
          return false;
        }
      });
      
      const campaignId = event ? 
        this.contract.interface.parseLog(event).args.campaignId.toString() : 
        null;

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        campaignId,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      logger.error('Error creating campaign on blockchain:', error);
      throw error;
    }
  }

  // Message logging
  async logMessage(campaignId, recipient, message, deliveryId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const recipientHash = this.hashPhoneNumber(recipient);
      const messageHash = this.hashMessage(message);
      
      const tx = await this.contract.logMessage(
        campaignId,
        recipientHash,
        messageHash,
        deliveryId
      );
      
      const receipt = await tx.wait();
      
      // Parse the event to get the message ID
      const event = receipt.logs.find(log => {
        try {
          return this.contract.interface.parseLog(log).name === 'MessageLogged';
        } catch {
          return false;
        }
      });
      
      const messageId = event ? 
        this.contract.interface.parseLog(event).args.messageId.toString() : 
        null;

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        messageId,
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      logger.error('Error logging message to blockchain:', error);
      throw error;
    }
  }

  // Update message status
  async updateMessageStatus(messageId, status) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      // Convert status string to enum value
      const statusMap = {
        'PENDING': 0,
        'SENT': 1,
        'DELIVERED': 2,
        'FAILED': 3
      };

      const statusValue = statusMap[status.toUpperCase()];
      if (statusValue === undefined) {
        throw new Error(`Invalid status: ${status}`);
      }

      const tx = await this.contract.updateMessageStatus(messageId, statusValue);
      const receipt = await tx.wait();

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      logger.error('Error updating message status on blockchain:', error);
      throw error;
    }
  }

  // Credits management
  async addCredits(userAddress, amount) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await this.contract.addCredits(userAddress, amount);
      const receipt = await tx.wait();

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      logger.error('Error adding credits on blockchain:', error);
      throw error;
    }
  }

  async purchaseCredits(userAddress, ethAmount) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      // Create contract instance with user's wallet (if we have it)
      // In production, this would be handled differently with user signatures
      const value = ethers.parseEther(ethAmount.toString());
      
      const tx = await this.contract.purchaseCredits({ value });
      const receipt = await tx.wait();

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        creditsAdded: (value / ethers.parseEther('0.001')).toString()
      };
      
    } catch (error) {
      logger.error('Error purchasing credits on blockchain:', error);
      throw error;
    }
  }

  // Query functions
  async getCampaign(campaignId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const campaign = await this.contract.getCampaign(campaignId);
      
      return {
        id: campaign.id.toString(),
        owner: campaign.owner,
        name: campaign.name,
        description: campaign.description,
        totalMessages: campaign.totalMessages.toString(),
        sentMessages: campaign.sentMessages.toString(),
        deliveredMessages: campaign.deliveredMessages.toString(),
        failedMessages: campaign.failedMessages.toString(),
        totalCost: campaign.totalCost.toString(),
        createdAt: new Date(Number(campaign.createdAt) * 1000),
        status: campaign.status
      };
      
    } catch (error) {
      logger.error('Error getting campaign from blockchain:', error);
      throw error;
    }
  }

  async getMessage(messageId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const message = await this.contract.getMessage(messageId);
      
      return {
        id: message.id.toString(),
        campaignId: message.campaignId.toString(),
        sender: message.sender,
        recipientHash: message.recipientHash,
        messageHash: message.messageHash,
        timestamp: new Date(Number(message.timestamp) * 1000),
        status: message.status,
        cost: message.cost.toString(),
        deliveryId: message.deliveryId
      };
      
    } catch (error) {
      logger.error('Error getting message from blockchain:', error);
      throw error;
    }
  }

  async getUserCredits(userAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const credits = await this.contract.getUserCredits(userAddress);
      
      return {
        balance: credits.balance.toString(),
        totalSpent: credits.totalSpent.toString(),
        totalMessages: credits.totalMessages.toString(),
        isActive: credits.isActive
      };
      
    } catch (error) {
      logger.error('Error getting user credits from blockchain:', error);
      throw error;
    }
  }

  async getTotalCampaigns() {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const total = await this.contract.getTotalCampaigns();
      return total.toString();
      
    } catch (error) {
      logger.error('Error getting total campaigns from blockchain:', error);
      throw error;
    }
  }

  async getTotalMessages() {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const total = await this.contract.getTotalMessages();
      return total.toString();
      
    } catch (error) {
      logger.error('Error getting total messages from blockchain:', error);
      throw error;
    }
  }

  // Admin functions
  async addAuthorizedSender(senderAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await this.contract.addAuthorizedSender(senderAddress);
      const receipt = await tx.wait();

      logger.logBlockchainTransaction({
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice.toString(),
        blockNumber: receipt.blockNumber,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString()
      });

      return {
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      logger.error('Error adding authorized sender on blockchain:', error);
      throw error;
    }
  }

  // Check if service is ready
  isReady() {
    return this.isInitialized && this.contract !== null;
  }

  // Get contract address
  getContractAddress() {
    return process.env.CONTRACT_ADDRESS;
  }

  // Get wallet address
  getWalletAddress() {
    return this.wallet ? this.wallet.address : null;
  }
}

module.exports = new BlockchainService();