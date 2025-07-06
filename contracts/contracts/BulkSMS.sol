pragma solidity ^0.8.20;

// SPDX-License-Identifier: MIT

contract BulkSMS {
    event BatchLogged(
        bytes32 indexed batchId,
        bytes32 indexed textHash,
        uint256 recipients,
        address indexed sender,
        uint256 timestamp
    );

    function logBatch(
        bytes32 batchId,
        bytes32 textHash,
        uint256 recipients
    ) external {
        require(recipients > 0 && recipients <= 10000, "Invalid recipient count");
        emit BatchLogged(batchId, textHash, recipients, msg.sender, block.timestamp);
    }
}