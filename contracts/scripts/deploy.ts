import { ethers } from "hardhat";

async function main() {
  const BulkSMS = await ethers.getContractFactory("BulkSMS");
  const bulkSMS = await BulkSMS.deploy();
  await bulkSMS.deployed();
  console.log(`BulkSMS deployed to: ${bulkSMS.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});