// TODO
// beautify the prints
// mock trade till bonding curve
// setup indexer for buy/sell graph

const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("BondingCurvePool", () => {
  let pool, owner, buyer, treasury;

  // Given parameters
  const initialTokenPrice = ethers.parseUnits("0.000001", "ether"); // 1×10^-6 ETH/token (100x increase)
  const initialLotteryPool = ethers.parseEther("57"); // 57 ETH initial lottery pool (~100K USD)
  const TOTAL_SUPPLY = ethers.parseUnits("1000000000", 18); // 1 billion tokens
  const MIGRATED_SUPPLY = ethers.parseUnits("800000000", 18); // 800 million tokens migrated to LP

  beforeEach(async () => {
    [owner, buyer, treasury] = await ethers.getSigners();
    const BondingCurvePool = await ethers.getContractFactory("BondingCurvePool");

    // Deploy with new parameters (name, symbol, initialTokenPrice, initialLotteryPool, treasury)
    pool = await BondingCurvePool.deploy(
      "Bonding Token",
      "BOND",
      initialTokenPrice,
      initialLotteryPool,
      treasury.address
    );

    // Add some initial ETH to the contract for testing
    await owner.sendTransaction({
      to: pool.target,
      value: ethers.parseEther("0.5") // 0.5 ETH for testing
    });
  });

  it("should properly initialize virtual reserves", async () => {
    // Check initial state
    const virtualTokenReserve = await pool.virtualTokenReserve();
    const virtualEthReserve = await pool.virtualEthReserve();
    const constantK = await pool.constant_k();
    const lotteryPool = await pool.lotteryPool();

    console.log("Initial Setup:");
    console.log("- Virtual Token Reserve:", ethers.formatUnits(virtualTokenReserve, 18));
    console.log("- Virtual ETH Reserve:", ethers.formatEther(virtualEthReserve));
    console.log("- Constant K:", ethers.formatEther(constantK));
    console.log("- Lottery Pool:", ethers.formatEther(lotteryPool));

    // Verify constant product formula
    const calculatedK = (virtualTokenReserve * virtualEthReserve) / ethers.parseUnits("1", 18);
    expect(calculatedK).to.be.closeTo(constantK, ethers.parseUnits("1", 10)); // Allow small rounding difference

    // Verify current price
    const currentPrice = await pool.calculateCurrentPrice();
    console.log("- Current Token Price:", ethers.formatEther(currentPrice));
    expect(currentPrice).to.be.closeTo(initialTokenPrice, ethers.parseUnits("0.0000001", 18));
  });

  it("should properly handle buy and sell operations", async () => {
    // Check initial state
    const initialSupply = await pool.totalSupply();
    const initialPrice = await pool.calculateCurrentPrice();
    const initialVirtualTokens = await pool.virtualTokenReserve();
    const initialVirtualEth = await pool.virtualEthReserve();

    console.log("Initial Supply:", ethers.formatUnits(initialSupply, 18));
    console.log("Initial Token Price:", ethers.formatEther(initialPrice));
    console.log("Initial Virtual Tokens:", ethers.formatUnits(initialVirtualTokens, 18));
    console.log("Initial Virtual ETH:", ethers.formatEther(initialVirtualEth));

    const currentPrice = await pool.calculateCurrentPrice();
    console.log("-Current Token Price:", ethers.formatEther(currentPrice));

    // Buyer purchases tokens
    console.log("\n--- BUYING TOKENS ---");
    const buyAmount = ethers.parseEther("0.05"); // Buy with 0.05 ETH
    const expectedTokens = await pool.calculateBuyReturn(buyAmount);
    console.log("Expected tokens to receive:", ethers.formatUnits(expectedTokens, 18));

    const currentPriceAfterBuy = await pool.calculateCurrentPrice();
    console.log("- Current Token Price After Buy:", ethers.formatEther(currentPrice));

    await pool.connect(buyer).buy({ value: buyAmount });

    // Check post-purchase state
    const buyerBalance = await pool.balanceOf(buyer.address);
    const priceAfterBuy = await pool.calculateCurrentPrice();
    const virtualTokensAfterBuy = await pool.virtualTokenReserve();
    const virtualEthAfterBuy = await pool.virtualEthReserve();

    console.log("Tokens Purchased:", ethers.formatUnits(buyerBalance, 18));
    console.log("Price After Buy:", ethers.formatEther(priceAfterBuy));
    console.log("Virtual Tokens After Buy:", ethers.formatUnits(virtualTokensAfterBuy, 18));
    console.log("Virtual ETH After Buy:", ethers.formatEther(virtualEthAfterBuy));

    // Verify price increased after purchase
    expect(priceAfterBuy).to.be.gt(initialPrice);

    // Verify tokens received matches calculation
    expect(buyerBalance).to.equal(expectedTokens);

    // Buyer sells half of their tokens
    console.log("\n--- SELLING TOKENS ---");
    const sellAmount = buyerBalance / 2n;
    const expectedEth = await pool.calculateSellReturn(sellAmount);
    console.log("Tokens to sell:", ethers.formatUnits(sellAmount, 18));
    console.log("Expected ETH to receive:", ethers.formatEther(expectedEth));

    // Get ETH balance before sale
    const ethBalanceBefore = await ethers.provider.getBalance(buyer.address);

    // Perform the sale
    const sellTx = await pool.connect(buyer).sell(sellAmount);
    const receipt = await sellTx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    // Get ETH balance after sale
    const ethBalanceAfter = await ethers.provider.getBalance(buyer.address);

    // Check post-sale state
    const balanceAfterSell = await pool.balanceOf(buyer.address);
    const priceAfterSell = await pool.calculateCurrentPrice();
    const virtualTokensAfterSell = await pool.virtualTokenReserve();
    const virtualEthAfterSell = await pool.virtualEthReserve();

    console.log("Remaining Tokens:", ethers.formatUnits(balanceAfterSell, 18));
    console.log("ETH Received (calculated from balance):", ethers.formatEther(ethBalanceAfter - ethBalanceBefore + gasCost));
    console.log("Price After Sell:", ethers.formatEther(priceAfterSell));
    console.log("Virtual Tokens After Sell:", ethers.formatUnits(virtualTokensAfterSell, 18));
    console.log("Virtual ETH After Sell:", ethers.formatEther(virtualEthAfterSell));

    // Verify price decreased after selling
    expect(priceAfterSell).to.be.lt(priceAfterBuy);

    // Verify remaining tokens
    expect(balanceAfterSell).to.equal(buyerBalance - sellAmount);

    // Verify ETH received (accounting for gas)
    expect(ethBalanceAfter - ethBalanceBefore + gasCost).to.be.closeTo(expectedEth, ethers.parseUnits("0.000001", 18));
  });

  it("should enforce minimum buy amount", async () => {
    console.log("\n--- TESTING MINIMUM BUY AMOUNT ---");
    const tooSmallAmount = ethers.parseEther("0.005"); // Below 0.01 ETH minimum

    try {
      await pool.connect(buyer).buy({ value: tooSmallAmount });
      expect.fail("Transaction should have failed due to minimum buy limit");
    } catch (error) {
      console.log("Transaction reverted as expected:", error.message.includes("Below minimum buy amount"));
    }
  });

  it("should enforce maximum buy amount", async () => {
    console.log("\n--- TESTING MAXIMUM BUY AMOUNT ---");

    // Get lottery pool and ETH raised
    const lotteryPool = await pool.lotteryPool();
    const ethRaised = await pool.ethRaised();

    // Calculate max buy (10% of remaining pool)
    const maxBuy = (lotteryPool - ethRaised) * 10n / 100n;
    console.log("Current lottery pool:", ethers.formatEther(lotteryPool));
    console.log("Current ETH raised:", ethers.formatEther(ethRaised));
    console.log("Max allowed buy:", ethers.formatEther(maxBuy));

    // Try buying slightly over the max
    const tooLargeAmount = maxBuy + ethers.parseEther("0.1");

    try {
      await pool.connect(buyer).buy({ value: tooLargeAmount });
      expect.fail("Transaction should have failed due to maximum buy limit");
    } catch (error) {
      console.log("Transaction reverted as expected:", error.message.includes("Exceeds maximum buy amount"));
    }

    // Confirm we can buy at exactly the maximum
    await pool.connect(buyer).buy({ value: maxBuy });
    console.log("Successfully bought tokens at max limit");
  });

  it("should revert when trying to sell more tokens than owned", async () => {
    console.log("\n--- TESTING SELLING MORE THAN OWNED ---");

    // Check buyer's balance
    const buyerBalance = await pool.balanceOf(buyer.address);
    console.log("Buyer's actual balance:", ethers.formatUnits(buyerBalance, 18));

    // Try to sell more tokens than owned
    const excessiveAmount = ethers.parseEther("1000");
    console.log("Attempting to sell:", ethers.formatUnits(excessiveAmount, 18));

    try {
      await pool.connect(buyer).sell(excessiveAmount);
      expect.fail("Expected transaction to revert but it didn't");
    } catch (error) {
      console.log("Transaction reverted as expected:", error.message.includes("Not enough tokens to sell"));
    }
  });

  it("should allow token burning", async () => {
    console.log("\n--- TESTING TOKEN BURNING ---");

    // First buy some tokens
    await pool.connect(buyer).buy({ value: ethers.parseEther("0.05") });
    const initialBalance = await pool.balanceOf(buyer.address);
    console.log("Initial token balance:", ethers.formatUnits(initialBalance, 18));

    // Burn half of the tokens
    const burnAmount = initialBalance / 2n;
    await pool.connect(buyer).burn(burnAmount);

    // Check balance after burning
    const finalBalance = await pool.balanceOf(buyer.address);
    console.log("Tokens burned:", ethers.formatUnits(burnAmount, 18));
    console.log("Final token balance:", ethers.formatUnits(finalBalance, 18));

    // Verify tokens were burned
    expect(finalBalance).to.equal(initialBalance - burnAmount);
  });

  it("should update virtual reserves when lottery pool changes", async () => {
    console.log("\n--- TESTING LOTTERY POOL UPDATES ---");

    // Get initial virtual reserves
    const initialVirtualTokens = await pool.virtualTokenReserve();
    const initialVirtualEth = await pool.virtualEthReserve();
    console.log("Initial Virtual Tokens:", ethers.formatUnits(initialVirtualTokens, 18));
    console.log("Initial Virtual ETH:", ethers.formatEther(initialVirtualEth));

    // Add to lottery pool
    const addAmount = ethers.parseEther("2");
    await pool.connect(owner).addToLotteryPool({ value: addAmount });

    // Get updated virtual reserves
    const updatedVirtualTokens = await pool.virtualTokenReserve();
    const updatedVirtualEth = await pool.virtualEthReserve();
    console.log("Lottery Pool Increased by:", ethers.formatEther(addAmount));
    console.log("Updated Virtual Tokens:", ethers.formatUnits(updatedVirtualTokens, 18));
    console.log("Updated Virtual ETH:", ethers.formatEther(updatedVirtualEth));

    // Verify virtual reserves changed
    expect(updatedVirtualTokens).to.not.equal(initialVirtualTokens);
    expect(updatedVirtualEth).to.not.equal(initialVirtualEth);

    // Verify constant K is maintained
    const initialK = (initialVirtualTokens * initialVirtualEth) / ethers.parseUnits("1", 18);
    const updatedK = (updatedVirtualTokens * updatedVirtualEth) / ethers.parseUnits("1", 18);
    console.log("Initial K:", ethers.formatEther(initialK));
    console.log("Updated K:", ethers.formatEther(updatedK));
    expect(updatedK).to.be.closeTo(initialK, ethers.parseUnits("0.0001", 18));
  });

  it("should demonstrate price changes with multiple buys", async () => {
    console.log("\n--- MULTIPLE BUYS PRICE IMPACT TEST ---");

    // Initial state
    const initialPrice = await pool.calculateCurrentPrice();
    console.log("\nInitial Price:", ethers.formatEther(initialPrice), "ETH/token");

    // Array of buy amounts to test
    const buyAmounts = [
      ethers.parseEther("0.01"),  // 0.01 ETH
      ethers.parseEther("0.02"),  // 0.02 ETH
      ethers.parseEther("0.03"),  // 0.03 ETH
      ethers.parseEther("0.04"),  // 0.04 ETH
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.06"),  // 0.06 ETH
      ethers.parseEther("0.07"),  // 0.07 ETH
      ethers.parseEther("0.08"),  // 0.08 ETH
      ethers.parseEther("0.09"),  // 0.09 ETH
      ethers.parseEther("0.1"),   // 0.1 ETH
      ethers.parseEther("0.15"),  // 0.15 ETH
      ethers.parseEther("0.2"),   // 0.2 ETH
      ethers.parseEther("0.25"),  // 0.25 ETH
      ethers.parseEther("0.3"),   // 0.3 ETH
      ethers.parseEther("0.35"),  // 0.35 ETH
      ethers.parseEther("0.4"),   // 0.4 ETH
      ethers.parseEther("0.45"),  // 0.45 ETH
      ethers.parseEther("0.5"),   // 0.5 ETH
      ethers.parseEther("0.55"),  // 0.55 ETH
      ethers.parseEther("0.6")    // 0.6 ETH
    ];

    let totalTokensBought = 0n;
    let totalEthSpent = 0n;

    console.log("\nBuy # | ETH Amount | Tokens Received | Price After Buy | Total Tokens | Total ETH Spent");
    console.log("------|------------|-----------------|-----------------|--------------|----------------");

    for (let i = 0; i < buyAmounts.length; i++) {
      const buyAmount = buyAmounts[i];

      // Calculate expected tokens before buying
      const expectedTokens = await pool.calculateBuyReturn(buyAmount);

      // Get price before buy
      const priceBeforeBuy = await pool.calculateCurrentPrice();

      // Perform the buy
      await pool.connect(buyer).buy({ value: buyAmount });

      // Get price after buy
      const priceAfterBuy = await pool.calculateCurrentPrice();

      // Update totals
      totalTokensBought += expectedTokens;
      totalEthSpent += buyAmount;

      // Format and print the results
      console.log(
        `${(i + 1).toString().padStart(4)} | ` +
        `${ethers.formatEther(buyAmount).padStart(10)} | ` +
        `${ethers.formatUnits(expectedTokens, 18).padStart(15)} | ` +
        `${ethers.formatEther(priceAfterBuy).padStart(15)} | ` +
        `${ethers.formatUnits(totalTokensBought, 18).padStart(12)} | ` +
        `${ethers.formatEther(totalEthSpent).padStart(14)}`
      );
    }

    // Print summary
    console.log("\nSummary:");
    console.log("Total ETH Spent:", ethers.formatEther(totalEthSpent), "ETH");
    console.log("Total Tokens Bought:", ethers.formatUnits(totalTokensBought, 18), "tokens");
    console.log("Average Price:", ethers.formatEther(totalEthSpent * BigInt(1e18) / totalTokensBought), "ETH/token");
    console.log("Final Price:", ethers.formatEther(await pool.calculateCurrentPrice()), "ETH/token");
    console.log("Price Increase:",
      ((Number(await pool.calculateCurrentPrice()) - Number(initialPrice)) / Number(initialPrice) * 100).toFixed(2),
      "%"
    );
  });
});
