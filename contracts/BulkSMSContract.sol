// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title BulkSMSContract
 * @dev Professional bulk SMS system with blockchain security and transparency
 */
contract BulkSMSContract is Ownable, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    
    Counters.Counter private _campaignIds;
    Counters.Counter private _messageIds;
    
    enum MessageStatus { PENDING, SENT, DELIVERED, FAILED }
    enum CampaignStatus { ACTIVE, PAUSED, COMPLETED, CANCELLED }
    
    struct SMSMessage {
        uint256 id;
        uint256 campaignId;
        address sender;
        string recipientHash; // Hashed phone number for privacy
        string messageHash;   // Hashed message content for privacy
        uint256 timestamp;
        MessageStatus status;
        uint256 cost;
        string deliveryId;    // External SMS provider delivery ID
    }
    
    struct Campaign {
        uint256 id;
        address owner;
        string name;
        string description;
        uint256 totalMessages;
        uint256 sentMessages;
        uint256 deliveredMessages;
        uint256 failedMessages;
        uint256 totalCost;
        uint256 createdAt;
        CampaignStatus status;
    }
    
    struct UserCredits {
        uint256 balance;
        uint256 totalSpent;
        uint256 totalMessages;
        bool isActive;
    }
    
    // State variables
    mapping(uint256 => SMSMessage) public messages;
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => UserCredits) public userCredits;
    mapping(address => bool) public authorizedSenders;
    mapping(string => bool) public usedDeliveryIds;
    
    uint256 public constant SMS_COST = 0.001 ether; // Cost per SMS
    uint256 public totalRevenue;
    uint256 public totalMessagesSent;
    
    // Events
    event CampaignCreated(uint256 indexed campaignId, address indexed owner, string name);
    event MessageLogged(uint256 indexed messageId, uint256 indexed campaignId, address indexed sender);
    event MessageStatusUpdated(uint256 indexed messageId, MessageStatus status);
    event CreditsAdded(address indexed user, uint256 amount);
    event CreditsPurchased(address indexed user, uint256 amount, uint256 cost);
    event AuthorizedSenderAdded(address indexed sender);
    event AuthorizedSenderRemoved(address indexed sender);
    
    constructor() {
        authorizedSenders[msg.sender] = true;
    }
    
    /**
     * @dev Add credits to user account
     */
    function addCredits(address user, uint256 amount) external onlyOwner {
        userCredits[user].balance += amount;
        userCredits[user].isActive = true;
        emit CreditsAdded(user, amount);
    }
    
    /**
     * @dev Purchase credits by sending Ether
     */
    function purchaseCredits() external payable nonReentrant {
        require(msg.value > 0, "Must send Ether to purchase credits");
        
        uint256 creditsToAdd = msg.value / SMS_COST;
        require(creditsToAdd > 0, "Insufficient Ether for credits");
        
        userCredits[msg.sender].balance += creditsToAdd;
        userCredits[msg.sender].isActive = true;
        totalRevenue += msg.value;
        
        emit CreditsPurchased(msg.sender, creditsToAdd, msg.value);
    }
    
    /**
     * @dev Create a new SMS campaign
     */
    function createCampaign(string memory name, string memory description) 
        external 
        returns (uint256) 
    {
        require(bytes(name).length > 0, "Campaign name required");
        require(userCredits[msg.sender].isActive, "User not active");
        
        _campaignIds.increment();
        uint256 campaignId = _campaignIds.current();
        
        campaigns[campaignId] = Campaign({
            id: campaignId,
            owner: msg.sender,
            name: name,
            description: description,
            totalMessages: 0,
            sentMessages: 0,
            deliveredMessages: 0,
            failedMessages: 0,
            totalCost: 0,
            createdAt: block.timestamp,
            status: CampaignStatus.ACTIVE
        });
        
        emit CampaignCreated(campaignId, msg.sender, name);
        return campaignId;
    }
    
    /**
     * @dev Log an SMS message to the blockchain
     */
    function logMessage(
        uint256 campaignId,
        string memory recipientHash,
        string memory messageHash,
        string memory deliveryId
    ) external whenNotPaused returns (uint256) {
        require(authorizedSenders[msg.sender], "Not authorized sender");
        require(campaigns[campaignId].id != 0, "Campaign does not exist");
        require(!usedDeliveryIds[deliveryId], "Delivery ID already used");
        require(userCredits[campaigns[campaignId].owner].balance >= 1, "Insufficient credits");
        
        _messageIds.increment();
        uint256 messageId = _messageIds.current();
        
        // Deduct credits
        userCredits[campaigns[campaignId].owner].balance -= 1;
        userCredits[campaigns[campaignId].owner].totalSpent += 1;
        userCredits[campaigns[campaignId].owner].totalMessages += 1;
        
        // Create message record
        messages[messageId] = SMSMessage({
            id: messageId,
            campaignId: campaignId,
            sender: campaigns[campaignId].owner,
            recipientHash: recipientHash,
            messageHash: messageHash,
            timestamp: block.timestamp,
            status: MessageStatus.PENDING,
            cost: SMS_COST,
            deliveryId: deliveryId
        });
        
        // Update campaign statistics
        campaigns[campaignId].totalMessages += 1;
        campaigns[campaignId].totalCost += SMS_COST;
        
        usedDeliveryIds[deliveryId] = true;
        totalMessagesSent += 1;
        
        emit MessageLogged(messageId, campaignId, campaigns[campaignId].owner);
        return messageId;
    }
    
    /**
     * @dev Update message delivery status
     */
    function updateMessageStatus(uint256 messageId, MessageStatus status) 
        external 
        whenNotPaused 
    {
        require(authorizedSenders[msg.sender], "Not authorized sender");
        require(messages[messageId].id != 0, "Message does not exist");
        
        MessageStatus oldStatus = messages[messageId].status;
        messages[messageId].status = status;
        
        // Update campaign statistics
        uint256 campaignId = messages[messageId].campaignId;
        
        // Remove old status count
        if (oldStatus == MessageStatus.SENT) {
            campaigns[campaignId].sentMessages -= 1;
        } else if (oldStatus == MessageStatus.DELIVERED) {
            campaigns[campaignId].deliveredMessages -= 1;
        } else if (oldStatus == MessageStatus.FAILED) {
            campaigns[campaignId].failedMessages -= 1;
        }
        
        // Add new status count
        if (status == MessageStatus.SENT) {
            campaigns[campaignId].sentMessages += 1;
        } else if (status == MessageStatus.DELIVERED) {
            campaigns[campaignId].deliveredMessages += 1;
        } else if (status == MessageStatus.FAILED) {
            campaigns[campaignId].failedMessages += 1;
        }
        
        emit MessageStatusUpdated(messageId, status);
    }
    
    /**
     * @dev Add authorized sender
     */
    function addAuthorizedSender(address sender) external onlyOwner {
        authorizedSenders[sender] = true;
        emit AuthorizedSenderAdded(sender);
    }
    
    /**
     * @dev Remove authorized sender
     */
    function removeAuthorizedSender(address sender) external onlyOwner {
        authorizedSenders[sender] = false;
        emit AuthorizedSenderRemoved(sender);
    }
    
    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Withdraw contract balance
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @dev Get campaign details
     */
    function getCampaign(uint256 campaignId) 
        external 
        view 
        returns (Campaign memory) 
    {
        return campaigns[campaignId];
    }
    
    /**
     * @dev Get message details
     */
    function getMessage(uint256 messageId) 
        external 
        view 
        returns (SMSMessage memory) 
    {
        return messages[messageId];
    }
    
    /**
     * @dev Get user credits info
     */
    function getUserCredits(address user) 
        external 
        view 
        returns (UserCredits memory) 
    {
        return userCredits[user];
    }
    
    /**
     * @dev Get total campaigns count
     */
    function getTotalCampaigns() external view returns (uint256) {
        return _campaignIds.current();
    }
    
    /**
     * @dev Get total messages count
     */
    function getTotalMessages() external view returns (uint256) {
        return _messageIds.current();
    }
}