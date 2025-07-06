const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying BulkSMSContract...");

  // Get the contract factory
  const BulkSMSContract = await ethers.getContractFactory("BulkSMSContract");

  // Deploy the contract
  const bulkSMSContract = await BulkSMSContract.deploy();
  await bulkSMSContract.waitForDeployment();

  const contractAddress = await bulkSMSContract.getAddress();
  
  console.log("BulkSMSContract deployed to:", contractAddress);
  console.log("Contract owner:", await bulkSMSContract.owner());
  
  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    contractAddress: contractAddress,
    deploymentTime: new Date().toISOString(),
    network: (await ethers.provider.getNetwork()).name,
    deployer: (await ethers.getSigners())[0].address
  };
  
  fs.writeFileSync(
    "deployment-info.json", 
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("Deployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });