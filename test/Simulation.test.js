const { expect } = require("chai");
const { ethers } = require("hardhat");
const { formatEther } = ethers;

describe("Market Simulation as a Test", function () {
  this.timeout(60000); // 1 minute timeout for the simulation

  it("for LOTTERY POOL = 1 ETH, should deploy a token, perform a series of buys, and log the market state", async function () {
    // --- Setup ---
    const [owner, buyer] = await ethers.getSigners();
    const tokenName = "Simulation Token";
    const tokenSymbol = "SIM";
    const initialLotteryPool = ethers.parseEther("1.0");
    const ethToUsdRate = 2496.30;

    console.log("\n  Deploying contracts to create a new token with a 1 ETH lottery pool...");
    // Deploy Launchpad
    const TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
    const launchpad = await TokenLaunchpad.deploy(owner.address);
    await launchpad.waitForDeployment();

    // Launch a new Pool using the Launchpad
    const tx = await launchpad.launchToken(tokenName, tokenSymbol, initialLotteryPool);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.eventName === 'TokenCreated');
    const poolAddress = event.args.tokenAddress;

    // Attach to the deployed pool contract
    const BondingCurvePool = await ethers.getContractFactory("BondingCurvePool");
    const pool = BondingCurvePool.attach(poolAddress);
    console.log(`  Pool deployed at: ${pool.target}`);
    console.log("  -------------------------------------------------------------------------------------------------------------------");


    // --- Initial State Logging ---
    // Note: The liquidity pool is a conceptual value calculated in the constructor.
    // We replicate the calculation here for display purposes, using the known tax rate of 22.22%.
    const TAX_RATE_NUMERATOR = 2222n;
    const TAX_RATE_DENOMINATOR = 10000n;
    const liquidityPool = (initialLotteryPool * TAX_RATE_DENOMINATOR) / TAX_RATE_NUMERATOR;

    const vTokenReserve = await pool.virtualTokenReserve();
    const vEthReserve = await pool.virtualEthReserve();
    const tokensInContract = await pool.balanceOf(pool.target);
    const ethInContract = await pool.ethRaised(); // Will be 0 initially

    console.log("  --- Initial Contract State ---");
    console.log(`  Conceptual Liquidity Pool: ${formatEther(liquidityPool)} ETH (Calculated from 1 ETH Lottery Pool / 22.22%)`);
    console.log(`  Virtual Token Reserve:     ${parseFloat(formatEther(vTokenReserve)).toLocaleString()} tokens`);
    console.log(`  Virtual ETH Reserve:       ${formatEther(vEthReserve)} ETH`);
    console.log(`  Tokens in Contract:        ${parseFloat(formatEther(tokensInContract)).toLocaleString()} tokens`);
    console.log(`  ETH Raised in Contract:    ${formatEther(ethInContract)} ETH`);
    console.log("  -------------------------------------------------------------------------------------------------------------------");


    // --- Simulation ---
    const buyAmounts = [0.1, 0.4, 0.4, 0.5, 0.5, 0.7, 1.0, 1.0, 2.0];
    const buyAmountsWei = buyAmounts.map(a => ethers.parseEther(a.toString()));
    const tableData = [];
    const INITIAL_SUPPLY = await pool.INITIAL_SUPPLY();
    let lotteryTaxDeactivatedNotified = false;

    console.log(`  Performing buys for: ${buyAmounts.join(', ')} ETH`);
    console.log(`  Using ETH/USD Rate: $${ethToUsdRate}`);
    console.log("  -------------------------------------------------------------------------------------------------------------------");


    for (const buyAmount of buyAmountsWei) {
      const balanceBefore = await pool.balanceOf(buyer.address);
      await pool.connect(buyer).buy({ value: buyAmount });
      const balanceAfter = await pool.balanceOf(buyer.address);
      const tokensReceived = balanceAfter - balanceBefore;

      const tokensLeft = await pool.balanceOf(pool.target);
      const ethRaised = await pool.ethRaised();
      const currentPrice = await pool.calculateCurrentPrice();
      const lotteryTaxIsActive = await pool.isLotteryTaxActive();

      if (!lotteryTaxIsActive && !lotteryTaxDeactivatedNotified) {
        console.log("\n  *** Lottery Tax Deactivated At This Step ***\n");
        lotteryTaxDeactivatedNotified = true;
      }

      const circulatingSupply = INITIAL_SUPPLY - tokensLeft;
      const marketCapInEth = (circulatingSupply * currentPrice) / (10n ** 18n);
      const marketCapInUsd = parseFloat(formatEther(marketCapInEth)) * ethToUsdRate;

      tableData.push({
        "Buy (ETH)": formatEther(buyAmount),
        "Tokens Received": parseFloat(formatEther(tokensReceived)).toLocaleString(),
        "Lottery Tax Active": lotteryTaxIsActive,
        "Tokens Left in Contract": parseFloat(formatEther(tokensLeft)).toLocaleString(),
        "ETH Raised in Contract": parseFloat(formatEther(ethRaised)).toFixed(4),
        "Token Price (ETH)": parseFloat(formatEther(currentPrice)).toExponential(4),
        "Market Cap (USD)": marketCapInUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      });
    }

    // --- Display Results ---
    console.log("\n  --- Market Simulation Results ---");
    console.table(tableData);
    console.log("  -------------------------------------------------------------------------------------------------------------------");

    // --- Final Tax Collection Logging ---
    const finalLotteryTax = await pool.accumulatedLotteryTax();
    const finalProtocolTax = await pool.accumulatedProtocolTax();
    const finalDevTax = await pool.accumulatedDevTax();

    console.log("\n  --- Final Tax Collections ---");
    console.log(`  Accumulated Lottery Tax:  ${formatEther(finalLotteryTax)} ETH`);
    console.log(`  Accumulated Protocol Tax: ${formatEther(finalProtocolTax)} ETH`);
    console.log(`  Accumulated Dev Tax:      ${formatEther(finalDevTax)} ETH`);
    console.log("  -------------------------------------------------------------------------------------------------------------------");


    // --- Sell Simulation ---
    const seller = buyer; // The user who bought tokens will now sell
    const sellAmounts = [100_000, 500_000, 1_000_000, 1_000_000, 100_000_000, 100_000_000, 100_000_000, 500_000, 500_000_000];
    const sellAmountsWei = sellAmounts.map(a => ethers.parseEther(a.toString()));
    const sellTableData = [];

    console.log(`\n  Performing sells for: ${sellAmounts.map(a => a.toLocaleString()).join(', ')} tokens`);
    
    for (const sellAmount of sellAmountsWei) {
      const sellerBalance = await pool.balanceOf(seller.address);
      if (sellerBalance < sellAmount) {
        console.log(`\n  Skipping sell of ${formatEther(sellAmount)} tokens, seller only has ${formatEther(sellerBalance)} tokens.`);
        continue;
      }

      const ethBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      const sellTx = await pool.connect(seller).sell(sellAmount);
      const sellReceipt = await sellTx.wait();
      const gasUsed = sellReceipt.gasUsed * sellTx.gasPrice;

      const ethBalanceAfter = await ethers.provider.getBalance(seller.address);
      const ethReceived = (ethBalanceAfter - ethBalanceBefore) + gasUsed;

      // Get state after sell
      const tokensLeft = await pool.balanceOf(pool.target);
      const ethRaised = await pool.ethRaised();
      const currentPrice = await pool.calculateCurrentPrice();
      const lotteryTaxIsActive = await pool.isLotteryTaxActive();

      const circulatingSupply = INITIAL_SUPPLY - tokensLeft;
      const marketCapInEth = (circulatingSupply * currentPrice) / (10n ** 18n);
      const marketCapInUsd = parseFloat(formatEther(marketCapInEth)) * ethToUsdRate;

      sellTableData.push({
        "Sell (Tokens)": parseFloat(formatEther(sellAmount)).toLocaleString(),
        "ETH Received": parseFloat(formatEther(ethReceived)).toFixed(4),
        "Tokens Left in Contract": parseFloat(formatEther(tokensLeft)).toLocaleString(),
        "ETH Raised in Contract": parseFloat(formatEther(ethRaised)).toFixed(4),
        "Token Price (ETH)": parseFloat(formatEther(currentPrice)).toExponential(4),
        "Market Cap (USD)": marketCapInUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      });
    }

    console.log("\n  --- Sell Simulation Results ---");
    console.table(sellTableData);
    console.log("  -------------------------------------------------------------------------------------------------------------------");


    // Add a simple assertion to make it a valid test
    const finalEthRaised = await pool.ethRaised();
    expect(finalEthRaised).to.be.gt(0);
  });
}); 