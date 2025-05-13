require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      // Default Hardhat network settings (if any specific needed)
    },
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/lEz-Nt7Cld5X_P3KJooPmUxDQzNtrRre", // Replace with your RPC URL or set in .env
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ['2ed3999c81c79fc39dd24e48e6301684a169fa59021d00eb5dff8b7eb5f6313b'], // Replace with your private key or set in .env
      chainId: 84532, // Base Sepolia chain ID
    },
  },
  etherscan: {
    // Optional: Add API key for contract verification on Basescan
    // apiKey: {
    //   baseSepolia: process.env.BASESCAN_API_KEY 
    // },
    // customChains: [
    //   {
    //     network: "baseSepolia",
    //     chainId: 84532,
    //     urls: {
    //       apiURL: "https://api-sepolia.basescan.org/api",
    //       browserURL: "https://sepolia.basescan.org"
    //     }
    //   }
    // ]
  }
};
