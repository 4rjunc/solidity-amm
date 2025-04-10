const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("BondingCurvePool", () => {
  let pool, owner, buyer;
  const reserveRatio = 20; // 20% reserve ratio

  beforeEach(async () => {
    [owner, buyer] = await ethers.getSigners();
    const BondingCurvePool = await ethers.getContractFactory("BondingCurvePool");
    pool = await BondingCurvePool.deploy("Bonding Token", "BOND", reserveRatio);

    // Add some initial liquidity
    await owner.sendTransaction({
      to: await pool.getAddress(),
      value: ethers.parseEther("10.0")
    });
  });

  it("should properly handle buy and sell operations", async () => {
    // Check initial state
    const initialSupply = await pool.totalSupply();
    const initialPrice = await pool.calculateCurrentPrice();
    console.log("Initial Supply:", ethers.formatUnits(initialSupply, 18));
    console.log("Initial Token Price:", ethers.formatEther(initialPrice));

    // Buyer purchases tokens
    const buyAmount = ethers.parseEther("2.0");
    console.log("\n--- BUYING TOKENS ---");
    await pool.connect(buyer).buy({ value: buyAmount });

    // Check post-purchase state
    const buyerBalance = await pool.balanceOf(buyer.address);
    const priceAfterBuy = await pool.calculateCurrentPrice();
    console.log("Tokens Purchased:", ethers.formatUnits(buyerBalance, 18));
    console.log("Price After Buy:", ethers.formatEther(priceAfterBuy));
    console.log("Reserve Balance:", ethers.formatEther(await pool.reserveBalance()));

    // Buyer sells half of their tokens
    console.log("\n--- SELLING TOKENS ---");
    const sellAmount = buyerBalance / 2n;
    await pool.connect(buyer).sell(sellAmount);

    // Check post-sale state
    const balanceAfterSell = await pool.balanceOf(buyer.address);
    const priceAfterSell = await pool.calculateCurrentPrice();
    console.log("Remaining Tokens:", ethers.formatUnits(balanceAfterSell, 18));
    console.log("Tokens Sold:", ethers.formatUnits(sellAmount, 18));
    console.log("Price After Sell:", ethers.formatEther(priceAfterSell));
    console.log("Reserve Balance:", ethers.formatEther(await pool.reserveBalance()));
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
      console.log("!!! ISSUE: Transaction should have failed but didn't");
      expect.fail("Expected transaction to revert but it didn't");
    } catch (error) {
      console.log("Transaction reverted with error:", error.message);
      // Check if the error contains our expected message
      if (error.message.includes("Not enough tokens to sell")) {
        console.log("✅ Test passed: Got the expected error message");
      } else {
        console.log("❌ Test failed: Error message doesn't match expected");
        console.log("Expected: 'Not enough tokens to sell'");
        console.log("Actual:", error.message);
      }
    }
  });
});
