import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import * as path from 'node:path';
import * as fs from 'node:fs';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private contract: ethers.Contract | null = null;

  constructor() {
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.CONTRACT_ADDRESS;

    if (!rpcUrl || !privateKey || !contractAddress) {
      this.logger.warn(
        'Blockchain environment variables not set. Contract interaction disabled.',
      );
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = new ethers.Wallet(privateKey, provider);

      const abiPath = path.join(__dirname, 'abi', 'BulkSMS.json');
      const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;

      this.contract = new ethers.Contract(contractAddress, abi, signer);
      this.logger.log(`Initialized BulkSMS contract at ${contractAddress}`);
    } catch (err) {
      this.logger.error('Failed to initialize contract', err as Error);
    }
  }

  async logBatch(
    batchId: string,
    textHash: string,
    recipients: number,
  ): Promise<void> {
    if (!this.contract) {
      this.logger.warn('Contract not initialized, skipping on-chain log');
      return;
    }

    try {
      const tx = await this.contract.logBatch(batchId, textHash, recipients);
      await tx.wait();
      this.logger.log(`Batch ${batchId} logged on chain (tx: ${tx.hash})`);
    } catch (err) {
      this.logger.error('On-chain logging failed', err as Error);
    }
  }
}