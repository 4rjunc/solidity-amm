const { ethers } = require("hardhat");

// Base Sepolia VRF Coordinator address
const BASE_SEPOLIA_VRF_COORDINATOR = "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE";
// Base Sepolia VRF KeyHash (This is often for a specific gas price, e.g., 500 Gwei on the vrf.chain.link UI for Base Sepolia)
const BASE_SEPOLIA_KEY_HASH = "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71";

// Mock wallet addresses for initial deployment
// In a real deployment, you'd want to replace these with actual addresses or manage them differently.
const MOCK_WALLET_ADDRESSES = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
  "0x6666666666666666666666666666666666666666",
  "0x7777777777777777777777777777777777777777",
  "0x8888888888888888888888888888888888888888",
  "0x9999999999999999999999999999999999999999",
  "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
];

async function main() {
  console.log("Deploying RandomWalletPicker contract to Base Sepolia...");
  console.log("Ensure your hardhat.config.js is set up for Base Sepolia (RPC URL, private key).");

  // You need to create a subscription ID through the Chainlink VRF UI for Base Sepolia
  // and add your contract as a consumer AFTER deployment.
  // Go to: https://vrf.chain.link/ (and select Base Sepolia network)
  const subscriptionId = process.env.BASE_SEPOLIA_SUBSCRIPTION_ID || "YOUR_BASE_SEPOLIA_SUBSCRIPTION_ID";

  if (subscriptionId === "YOUR_BASE_SEPOLIA_SUBSCRIPTION_ID") {
    console.error("ERROR: You MUST set your actual VRF subscription ID for Base Sepolia.");
    console.error("Create a subscription at https://vrf.chain.link/ (select Base Sepolia) and set BASE_SEPOLIA_SUBSCRIPTION_ID environment variable or update the script.");
    process.exit(1);
  }

  console.log(`Using Subscription ID for Base Sepolia: ${subscriptionId}`);

  // Deploy the RandomWalletPicker contract
  const RandomWalletPicker = await ethers.getContractFactory("RandomWalletPicker");
  console.log("Deploying contract with:");
  console.log(`  Initial Wallets: ${MOCK_WALLET_ADDRESSES.length} addresses`);
  console.log(`  VRF Coordinator (Base Sepolia): ${BASE_SEPOLIA_VRF_COORDINATOR}`);
  console.log(`  Subscription ID: ${subscriptionId}`);
  console.log(`  Key Hash (Base Sepolia): ${BASE_SEPOLIA_KEY_HASH}`);

  const randomWalletPicker = await RandomWalletPicker.deploy(
    MOCK_WALLET_ADDRESSES,
    BASE_SEPOLIA_VRF_COORDINATOR,
    subscriptionId,
    BASE_SEPOLIA_KEY_HASH
  );

  await randomWalletPicker.waitForDeployment();

  const address = await randomWalletPicker.getAddress();
  console.log(`\nRandomWalletPicker deployed to Base Sepolia at: ${address}`);
  console.log("\nIMPORTANT: After deployment, you MUST add this contract address as a consumer to your VRF subscription on Base Sepolia.");
  console.log("Go to: https://vrf.chain.link/ (select Base Sepolia network), find your subscription, and add consumer.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  }); 