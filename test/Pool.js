// TODO
// beautify the prints
// mock trade till bonding curve
// setup indexer for buy/sell graph

const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Lauchpad", () => {
  let launchpad, token1, token1Address, token2, token2Address, owner, buyer, user2, treasury;

  // Constants for token creation
  const TOKEN1_NAME = "DOG Coin";
  const TOKEN1_SYMBOL = "DOG";
  const TOKEN1_LOTTERY_POOL = ethers.parseEther("5"); // 5 ETH lottery pool

  console.log("TOKEN1_LOTTERY_POOL", TOKEN1_LOTTERY_POOL);


  const TOKEN2_NAME = "CAT Coin";
  const TOKEN2_SYMBOL = "CAT";
  const TOKEN2_LOTTERY_POOL = ethers.parseEther("10"); // 10 ETH lottery pool

  // Given parameters
  //const initialTokenPrice = ethers.parseUnits("0.000001", "ether"); // 1×10^-6 ETH/token (100x increase)
  //const initialLotteryPool = ethers.parseEther("57"); // 57 ETH initial lottery pool (~100K USD)
  //const TOTAL_SUPPLY = ethers.parseUnits("1000000000", 18); // 1 billion tokens
  //const MIGRATED_SUPPLY = ethers.parseUnits("800000000", 18); // 800 million tokens migrated to LP

  before(async () => {

    // treasury is where team split gooes
    [owner, buyer, user2, treasury] = await ethers.getSigners();
    const TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
    launchpad = await TokenLaunchpad.deploy(owner.address);

    // delpoy 1st token
    const tx1 = await launchpad.launchToken(
      TOKEN1_NAME,
      TOKEN1_SYMBOL,
      TOKEN1_LOTTERY_POOL,
      treasury.address // Pass treasury address instead of price
    );

    const receipt1 = await tx1.wait();

    const tx2 = await launchpad.launchToken(
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      TOKEN2_LOTTERY_POOL,
      treasury.address // Pass treasury address instead of price
    );

    const receipt2 = await tx2.wait();

    //console.log("\nreceipt1:", receipt1);
    //console.log("\nreceipt2:", receipt2);

    const tokens = await launchpad.getAllTokens();
    //console.log("\ntokens:", tokens);

    token1Address = tokens[0][0];
    console.log("token1", token1Address);

    token2Address = tokens[1][0];
    console.log("token2", token2Address);

  });

  //describe("Token Creation", function() {
  //  it("Should create tokens correctly", async function() {
  //    // Check basic properties of token1
  //    expect(await token1.name()).to.equal(TOKEN1_NAME);
  //    expect(await token1.symbol()).to.equal(TOKEN1_SYMBOL);
  //
  //    // Check basic properties of token2
  //    expect(await token2.name()).to.equal(TOKEN2_NAME);
  //    expect(await token2.symbol()).to.equal(TOKEN2_SYMBOL);
  //
  //    // Check launchpad's token list
  //    const tokens = await launchpad.getAllTokens();
  //    expect(tokens.length).to.equal(2);
  //    expect(tokens[0].name).to.equal(TOKEN1_NAME);
  //    expect(tokens[1].name).to.equal(TOKEN2_NAME);
  //  });
  //});

  it("TOKEN 1", async () => {
    // Check initial state
    token1 = await ethers.getContractAt("BondingCurvePool", token1Address);
    //console.log("token1", token1);
    const virtualTokenReserve = await token1.virtualTokenReserve();
    const virtualEthReserve = await token1.virtualEthReserve();
    const constantK = await token1.constant_k();
    const lotteryPool = await token1.lotteryPool();
    const initialPriceFromContract = await token1.initialTokenPrice(); // Get the internally calculated price

    console.log("Token 1");
    console.log("- Virtual Token Reserve:", ethers.formatUnits(virtualTokenReserve, 18));
    console.log("- Virtual ETH Reserve:", ethers.formatEther(virtualEthReserve));
    console.log("- Constant K:", ethers.formatEther(constantK));
    console.log("- Lottery Pool:", ethers.formatEther(lotteryPool));
    console.log("- Initial Token Price (from contract):", ethers.formatEther(initialPriceFromContract));

    // Verify constant product formula
    const calculatedK = (virtualTokenReserve * virtualEthReserve) / ethers.parseUnits("1", 18);
    expect(calculatedK).to.be.closeTo(constantK, ethers.parseUnits("1", 10)); // Allow small rounding difference

    // Verify current price (should match the initialTokenPrice from contract now)
    const currentPrice = await token1.calculateCurrentPrice();
    console.log("- Current Token Price (matches initial):", ethers.formatEther(currentPrice));
    expect(currentPrice).to.be.closeTo(initialPriceFromContract, ethers.parseUnits("0.000000000000001", 18)); // Adjust precision as needed
  });

  it("TOKEN 2", async () => {
    // Check initial state
    token2 = await ethers.getContractAt("BondingCurvePool", token2Address);
    //console.log("token2", token2);
    const virtualTokenReserve = await token2.virtualTokenReserve();
    const virtualEthReserve = await token2.virtualEthReserve();
    const constantK = await token2.constant_k();
    const lotteryPool = await token2.lotteryPool();
    const initialPriceFromContract = await token2.initialTokenPrice(); // Get the internally calculated price

    console.log("Token 2");
    console.log("- Virtual Token Reserve:", ethers.formatUnits(virtualTokenReserve, 18));
    console.log("- Virtual ETH Reserve:", ethers.formatEther(virtualEthReserve));
    console.log("- Constant K:", ethers.formatEther(constantK));
    console.log("- Lottery Pool:", ethers.formatEther(lotteryPool));
    console.log("- Initial Token Price (from contract):", ethers.formatEther(initialPriceFromContract));

    // Verify constant product formula
    const calculatedK = (virtualTokenReserve * virtualEthReserve) / ethers.parseUnits("1", 18);
    expect(calculatedK).to.be.closeTo(constantK, ethers.parseUnits("1", 10)); // Allow small rounding difference

    // Verify current price (should match the initialTokenPrice from contract now)
    const currentPrice = await token2.calculateCurrentPrice();
    console.log("- Current Token Price (matches initial):", ethers.formatEther(currentPrice));
    expect(currentPrice).to.be.closeTo(initialPriceFromContract, ethers.parseUnits("0.000000000000001", 18)); // Adjust precision
  });

  it("Token 1 handle buy and sell operations", async () => {
    // Check initial state
    const pool = await ethers.getContractAt("BondingCurvePool", token1Address);
    //console.log("token1", token1);
    const initialSupply = await pool.totalSupply();
    const initialPrice = await pool.initialTokenPrice(); // Use the stored initial price
    const initialVirtualTokens = await pool.virtualTokenReserve();
    const initialVirtualEth = await pool.virtualEthReserve();

    console.log("Initial Supply:", ethers.formatUnits(initialSupply, 18));
    console.log("Initial Token Price:", ethers.formatEther(initialPrice));
    console.log("Initial Virtual Tokens:", ethers.formatUnits(initialVirtualTokens, 18));
    console.log("Initial Virtual ETH:", ethers.formatEther(initialVirtualEth));

    const currentPrice = await pool.calculateCurrentPrice();
    console.log("-Current Token Price (should match initial):", ethers.formatEther(currentPrice));
    expect(currentPrice).to.be.closeTo(initialPrice, ethers.parseUnits("0.000000000000001", 18));

    // Buyer purchases tokens
    console.log("\n--- BUYING TOKENS ---");
    // Adjust netEthForCurve calculation based on new fee structure in Pool.sol if needed
    // For now, assuming calculateBuyReturn correctly handles this internally if fees are deducted before calculation.
    // If calculateBuyReturn expects gross ETH, the test is fine.
    // The Pool.sol buy() function calculates netEthForCurve from msg.value, and then calls calculateBuyReturn(netEthForCurve).
    // So, we should calculate expected tokens based on netEthForCurve.

    const grossBuyAmount = ethers.parseEther("0.05"); // Buyer sends 0.05 ETH

    // Simulate fee calculation to get netEthForCurve for calculateBuyReturn
    const LOTTERY_POOL_FEE_NUMERATOR = 30n;
    const LOTTERY_POOL_FEE_DENOMINATOR = 100n;
    const HOLDER_POOL_FEE_NUMERATOR = 111n;
    const HOLDER_POOL_FEE_DENOMINATOR = 10000n;
    const PROTOCOL_POOL_FEE_NUMERATOR = 111n;
    const PROTOCOL_POOL_FEE_DENOMINATOR = 10000n;
    const DEV_FEE_NUMERATOR = 111n;
    const DEV_FEE_DENOMINATOR = 10000n;

    let totalFeesPaid = 0n;
    const isLotteryTaxActive = await pool.isLotteryTaxActive(); // Check current status
    if (isLotteryTaxActive) {
        const lotteryFee = (grossBuyAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
        totalFeesPaid += lotteryFee;
    }
    const holderFee = (grossBuyAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
    totalFeesPaid += holderFee;
    const protocolFee = (grossBuyAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
    totalFeesPaid += protocolFee;
    const devFee = (grossBuyAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
    totalFeesPaid += devFee;

    const netEthForCurve = grossBuyAmount - totalFeesPaid;
    console.log("Gross ETH for buy:", ethers.formatEther(grossBuyAmount));
    console.log("Total fees estimated:", ethers.formatEther(totalFeesPaid));
    console.log("Net ETH for curve:", ethers.formatEther(netEthForCurve));

    const expectedTokens = await pool.calculateBuyReturn(netEthForCurve);
    console.log("Expected tokens to receive (for net ETH):", ethers.formatUnits(expectedTokens, 18));

    // Price before this specific buy transaction
    const priceBeforeThisBuy = await pool.calculateCurrentPrice(); 
    console.log("- Price just before this buy:", ethers.formatEther(priceBeforeThisBuy));

    await pool.connect(buyer).buy({ value: grossBuyAmount });

    // Check post-purchase state
    const buyerBalance = await pool.balanceOf(buyer.address);
    const priceAfterBuy = await pool.calculateCurrentPrice();
    const virtualTokensAfterBuy = await pool.virtualTokenReserve();
    const virtualEthAfterBuy = await pool.virtualEthReserve();
    const ethRaisedAfterBuy = await pool.ethRaised();

    console.log("Tokens Purchased:", ethers.formatUnits(buyerBalance, 18));
    console.log("Price After Buy:", ethers.formatEther(priceAfterBuy));
    console.log("Virtual Tokens After Buy:", ethers.formatUnits(virtualTokensAfterBuy, 18));
    console.log("Virtual ETH After Buy:", ethers.formatEther(virtualEthAfterBuy));
    console.log("ETH Raised by curve after buy:", ethers.formatEther(ethRaisedAfterBuy));

    // Verify price increased after purchase
    expect(priceAfterBuy).to.be.gt(priceBeforeThisBuy); // Compare with price just before this buy

    // Verify tokens received matches calculation
    expect(buyerBalance).to.equal(expectedTokens);

    // Buyer sells half of their tokens
    console.log("\n--- SELLING TOKENS ---");
    const sellAmount = buyerBalance / 2n;
    const expectedEth = await pool.calculateSellReturn(sellAmount);
    console.log("Tokens to sell:", ethers.formatUnits(sellAmount, 18));
    console.log("Expected ETH to receive (gross, before any sell fees if they existed):", ethers.formatEther(expectedEth));

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
    const ethRaisedAfterSell = await pool.ethRaised(); // Check ethRaised after sell

    console.log("Remaining Tokens:", ethers.formatUnits(balanceAfterSell, 18));
    console.log("ETH Received (calculated from balance):", ethers.formatEther(ethBalanceAfter - ethBalanceBefore + gasCost));
    console.log("Price After Sell:", ethers.formatEther(priceAfterSell));
    console.log("Virtual Tokens After Sell:", ethers.formatUnits(virtualTokensAfterSell, 18));
    console.log("Virtual ETH After Sell:", ethers.formatEther(virtualEthAfterSell));
    console.log("ETH Raised by curve after sell:", ethers.formatEther(ethRaisedAfterSell));

    // Verify price decreased after selling
    expect(priceAfterSell).to.be.lt(priceAfterBuy);

    // Verify remaining tokens
    expect(balanceAfterSell).to.equal(buyerBalance - sellAmount);

    // Verify ETH received (accounting for gas)
    expect(ethBalanceAfter - ethBalanceBefore + gasCost).to.be.closeTo(expectedEth, ethers.parseUnits("0.000001", 18));
  });

  it("Token 2 handle buy and sell operations", async () => {
    // Check initial state
    const pool = await ethers.getContractAt("BondingCurvePool", token2Address);
    //console.log("token1", token1);
    const initialSupply = await pool.totalSupply();
    const initialPrice = await pool.initialTokenPrice(); // Use the stored initial price
    const initialVirtualTokens = await pool.virtualTokenReserve();
    const initialVirtualEth = await pool.virtualEthReserve();

    console.log("Initial Supply:", ethers.formatUnits(initialSupply, 18));
    console.log("Initial Token Price:", ethers.formatEther(initialPrice));
    console.log("Initial Virtual Tokens:", ethers.formatUnits(initialVirtualTokens, 18));
    console.log("Initial Virtual ETH:", ethers.formatEther(initialVirtualEth));

    const currentPrice = await pool.calculateCurrentPrice();
    console.log("-Current Token Price (should match initial):", ethers.formatEther(currentPrice));
    expect(currentPrice).to.be.closeTo(initialPrice, ethers.parseUnits("0.000000000000001", 18));

    // Buyer purchases tokens
    console.log("\n--- BUYING TOKENS ---");
    const grossBuyAmount = ethers.parseEther("0.05"); // Buyer sends 0.05 ETH

    // Simulate fee calculation to get netEthForCurve
    const LOTTERY_POOL_FEE_NUMERATOR = 30n;
    const LOTTERY_POOL_FEE_DENOMINATOR = 100n;
    const HOLDER_POOL_FEE_NUMERATOR = 111n;
    const HOLDER_POOL_FEE_DENOMINATOR = 10000n;
    const PROTOCOL_POOL_FEE_NUMERATOR = 111n;
    const PROTOCOL_POOL_FEE_DENOMINATOR = 10000n;
    const DEV_FEE_NUMERATOR = 111n;
    const DEV_FEE_DENOMINATOR = 10000n;

    let totalFeesPaid = 0n;
    const isLotteryTaxActive = await pool.isLotteryTaxActive(); // Check current status
    if (isLotteryTaxActive) {
        const lotteryFee = (grossBuyAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
        totalFeesPaid += lotteryFee;
    }
    const holderFee = (grossBuyAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
    totalFeesPaid += holderFee;
    const protocolFee = (grossBuyAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
    totalFeesPaid += protocolFee;
    const devFee = (grossBuyAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
    totalFeesPaid += devFee;
    
    const netEthForCurve = grossBuyAmount - totalFeesPaid;
    console.log("Gross ETH for buy:", ethers.formatEther(grossBuyAmount));
    console.log("Total fees estimated:", ethers.formatEther(totalFeesPaid));
    console.log("Net ETH for curve:", ethers.formatEther(netEthForCurve));

    const expectedTokens = await pool.calculateBuyReturn(netEthForCurve);
    console.log("Expected tokens to receive (for net ETH):", ethers.formatUnits(expectedTokens, 18));

    const priceBeforeThisBuy = await pool.calculateCurrentPrice();
    console.log("- Price just before this buy:", ethers.formatEther(priceBeforeThisBuy));

    await pool.connect(buyer).buy({ value: grossBuyAmount });

    // Check post-purchase state
    const buyerBalance = await pool.balanceOf(buyer.address);
    const priceAfterBuy = await pool.calculateCurrentPrice();
    const virtualTokensAfterBuy = await pool.virtualTokenReserve();
    const virtualEthAfterBuy = await pool.virtualEthReserve();
    const ethRaisedAfterBuy = await pool.ethRaised();

    console.log("Tokens Purchased:", ethers.formatUnits(buyerBalance, 18));
    console.log("Price After Buy:", ethers.formatEther(priceAfterBuy));
    console.log("Virtual Tokens After Buy:", ethers.formatUnits(virtualTokensAfterBuy, 18));
    console.log("Virtual ETH After Buy:", ethers.formatEther(virtualEthAfterBuy));
    console.log("ETH Raised by curve after buy:", ethers.formatEther(ethRaisedAfterBuy));

    // Verify price increased after purchase
    expect(priceAfterBuy).to.be.gt(priceBeforeThisBuy);

    // Verify tokens received matches calculation
    expect(buyerBalance).to.equal(expectedTokens);

    // Buyer sells half of their tokens
    console.log("\n--- SELLING TOKENS ---");
    const sellAmount = buyerBalance / 2n;
    const expectedEth = await pool.calculateSellReturn(sellAmount);
    console.log("Tokens to sell:", ethers.formatUnits(sellAmount, 18));
    console.log("Expected ETH to receive (gross, before sell fees):", ethers.formatEther(expectedEth));

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
    const ethRaisedAfterSell = await pool.ethRaised();

    console.log("Remaining Tokens:", ethers.formatUnits(balanceAfterSell, 18));
    console.log("ETH Received (calculated from balance):", ethers.formatEther(ethBalanceAfter - ethBalanceBefore + gasCost));
    console.log("Price After Sell:", ethers.formatEther(priceAfterSell));
    console.log("Virtual Tokens After Sell:", ethers.formatUnits(virtualTokensAfterSell, 18));
    console.log("Virtual ETH After Sell:", ethers.formatEther(virtualEthAfterSell));
    console.log("ETH Raised by curve after sell:", ethers.formatEther(ethRaisedAfterSell));

    // Verify price decreased after selling
    expect(priceAfterSell).to.be.lt(priceAfterBuy);

    // Verify remaining tokens
    expect(balanceAfterSell).to.equal(buyerBalance - sellAmount);

    // Verify ETH received (accounting for gas)
    expect(ethBalanceAfter - ethBalanceBefore + gasCost).to.be.closeTo(expectedEth, ethers.parseUnits("0.000001", 18));
  });


  //it("should enforce minimum buy amount", async () => {
  //  console.log("\n--- TESTING MINIMUM BUY AMOUNT ---");
  //  const tooSmallAmount = ethers.parseEther("0.005"); // Below 0.01 ETH minimum
  //
  //  try {
  //    await pool.connect(buyer).buy({ value: tooSmallAmount });
  //    expect.fail("Transaction should have failed due to minimum buy limit");
  //  } catch (error) {
  //    console.log("Transaction reverted as expected:", error.message.includes("Below minimum buy amount"));
  //  }
  //});

  //it("should enforce maximum buy amount", async () => {
  //  console.log("\n--- TESTING MAXIMUM BUY AMOUNT ---");
  //
  //  // Get lottery pool and ETH raised
  //  const lotteryPool = await pool.lotteryPool();
  //  const ethRaised = await pool.ethRaised();
  //
  //  // Calculate max buy (10% of remaining pool)
  //  const maxBuy = (lotteryPool - ethRaised) * 10n / 100n;
  //  console.log("Current lottery pool:", ethers.formatEther(lotteryPool));
  //  console.log("Current ETH raised:", ethers.formatEther(ethRaised));
  //  console.log("Max allowed buy:", ethers.formatEther(maxBuy));
  //
  //  // Try buying slightly over the max
  //  const tooLargeAmount = maxBuy + ethers.parseEther("0.1");
  //
  //  try {
  //    await pool.connect(buyer).buy({ value: tooLargeAmount });
  //    expect.fail("Transaction should have failed due to maximum buy limit");
  //  } catch (error) {
  //    console.log("Transaction reverted as expected:", error.message.includes("Exceeds maximum buy amount"));
  //  }
  //
  //  // Confirm we can buy at exactly the maximum
  //  await pool.connect(buyer).buy({ value: maxBuy });
  //  console.log("Successfully bought tokens at max limit");
  //});

  //it("should revert when trying to sell more tokens than owned", async () => {
  //  console.log("\n--- TESTING SELLING MORE THAN OWNED ---");
  //
  //  // Check buyer's balance
  //  const buyerBalance = await pool.balanceOf(buyer.address);
  //  console.log("Buyer's actual balance:", ethers.formatUnits(buyerBalance, 18));
  //
  //  // Try to sell more tokens than owned
  //  const excessiveAmount = ethers.parseEther("1000");
  //  console.log("Attempting to sell:", ethers.formatUnits(excessiveAmount, 18));
  //
  //  try {
  //    await pool.connect(buyer).sell(excessiveAmount);
  //    expect.fail("Expected transaction to revert but it didn't");
  //  } catch (error) {
  //    console.log("Transaction reverted as expected:", error.message.includes("Not enough tokens to sell"));
  //  }
  //});
  //
  //it("should allow token burning", async () => {
  //  console.log("\n--- TESTING TOKEN BURNING ---");
  //
  //  // First buy some tokens
  //  await pool.connect(buyer).buy({ value: ethers.parseEther("0.05") });
  //  const initialBalance = await pool.balanceOf(buyer.address);
  //  console.log("Initial token balance:", ethers.formatUnits(initialBalance, 18));
  //
  //  // Burn half of the tokens
  //  const burnAmount = initialBalance / 2n;
  //  await pool.connect(buyer).burn(burnAmount);
  //
  //  // Check balance after burning
  //  const finalBalance = await pool.balanceOf(buyer.address);
  //  console.log("Tokens burned:", ethers.formatUnits(burnAmount, 18));
  //  console.log("Final token balance:", ethers.formatUnits(finalBalance, 18));
  //
  //  // Verify tokens were burned
  //  expect(finalBalance).to.equal(initialBalance - burnAmount);
  //});
  //
  //it("should update virtual reserves when lottery pool changes", async () => {
  //  console.log("\n--- TESTING LOTTERY POOL UPDATES ---");
  //
  //  // Get initial virtual reserves
  //  const initialVirtualTokens = await pool.virtualTokenReserve();
  //  const initialVirtualEth = await pool.virtualEthReserve();
  //  console.log("Initial Virtual Tokens:", ethers.formatUnits(initialVirtualTokens, 18));
  //  console.log("Initial Virtual ETH:", ethers.formatEther(initialVirtualEth));
  //
  //  // Add to lottery pool
  //  const addAmount = ethers.parseEther("2");
  //  await pool.connect(owner).addToLotteryPool({ value: addAmount });
  //
  //  // Get updated virtual reserves
  //  const updatedVirtualTokens = await pool.virtualTokenReserve();
  //  const updatedVirtualEth = await pool.virtualEthReserve();
  //  console.log("Lottery Pool Increased by:", ethers.formatEther(addAmount));
  //  console.log("Updated Virtual Tokens:", ethers.formatUnits(updatedVirtualTokens, 18));
  //  console.log("Updated Virtual ETH:", ethers.formatEther(updatedVirtualEth));
  //
  //  // Verify virtual reserves changed
  //  expect(updatedVirtualTokens).to.not.equal(initialVirtualTokens);
  //  expect(updatedVirtualEth).to.not.equal(initialVirtualEth);
  //
  //  // Verify constant K is maintained
  //  const initialK = (initialVirtualTokens * initialVirtualEth) / ethers.parseUnits("1", 18);
  //  const updatedK = (updatedVirtualTokens * updatedVirtualEth) / ethers.parseUnits("1", 18);
  //  console.log("Initial K:", ethers.formatEther(initialK));
  //  console.log("Updated K:", ethers.formatEther(updatedK));
  //  expect(updatedK).to.be.closeTo(initialK, ethers.parseUnits("0.0001", 18));
  //});

  it("Token 1 price changes with multiple buys", async () => {
    console.log(`\n--- TOKEN 1 ${token1Address} MULTIPLE BUYS PRICE IMPACT TEST ---`);
    const pool = await ethers.getContractAt("BondingCurvePool", token1Address);

    // Initial state
    const initialPrice = await pool.initialTokenPrice(); // Use stored initial price
    console.log("\nInitial Price for Token 1 multiple buys:", ethers.formatEther(initialPrice), "ETH/token");

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
      ethers.parseEther("0.04"),   // 0.04 ETH
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.01"),   // 0.01 ETH
      ethers.parseEther("0.02"),  // 0.02 ETH
      ethers.parseEther("0.1")    // 0.1 ETH
    ];

    let totalTokensBought = 0n;
    let totalEthSpent = 0n;

    console.log("\nBuy # | ETH Amount | Tokens Received | Price After Buy | Total Tokens | Total ETH Spent");
    console.log("------|------------|-----------------|-----------------|--------------|----------------");

    for (let i = 0; i < buyAmounts.length; i++) {
      const buyAmount = buyAmounts[i];

      try {
        // Simulate fee calculation to get netEthForCurve for calculateBuyReturn
        const LOTTERY_POOL_FEE_NUMERATOR = 30n;
        const LOTTERY_POOL_FEE_DENOMINATOR = 100n;
        const HOLDER_POOL_FEE_NUMERATOR = 111n;
        const HOLDER_POOL_FEE_DENOMINATOR = 10000n;
        const PROTOCOL_POOL_FEE_NUMERATOR = 111n;
        const PROTOCOL_POOL_FEE_DENOMINATOR = 10000n;
        const DEV_FEE_NUMERATOR = 111n;
        const DEV_FEE_DENOMINATOR = 10000n;

        let totalFeesPaidForThisBuy = 0n;
        const isLotteryTaxActive = await pool.isLotteryTaxActive();
        if (isLotteryTaxActive) {
            const lotteryFee = (buyAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
            totalFeesPaidForThisBuy += lotteryFee;
        }
        const holderFee = (buyAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += holderFee;
        const protocolFee = (buyAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += protocolFee;
        const devFee = (buyAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += devFee;
        
        const netEthForCurveForThisBuy = buyAmount - totalFeesPaidForThisBuy;

        // Calculate expected tokens before buying, based on net ETH
        const expectedTokens = await pool.calculateBuyReturn(netEthForCurveForThisBuy);

        // Get price before buy
        const priceBeforeBuy = await pool.calculateCurrentPrice();

        // Check max allowed buy (without making a transaction)
        // Get the current lotteryPool and ethRaised values
        const lotteryPool = await pool.lotteryPool();
        const ethRaised = await pool.ethRaised();
        const maxBuy = (lotteryPool - ethRaised) * 10n / 100n; // 10% of remaining pool

        if (buyAmount > maxBuy) {
          console.log(
            `${(i + 1).toString().padStart(4)} | ` +
            `${ethers.formatEther(buyAmount).padStart(10)} | ` +
            `SKIPPED - Exceeds maximum buy of ${ethers.formatEther(maxBuy)} ETH (10% of remaining pool)`
          );
          continue;
        }

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
      } catch (error) {
        // If we hit an error, log it and continue with the next amount
        console.log(
          `${(i + 1).toString().padStart(4)} | ` +
          `${ethers.formatEther(buyAmount).padStart(10)} | ` +
          `ERROR: ${error.message}`
        );

        // Optional: If you want to stop the test after first error
        // break;
      }
    }

    // Print summary
    console.log("\nSummary:");
    console.log("Total ETH Spent:", ethers.formatEther(totalEthSpent), "ETH");
    console.log("Total Tokens Bought:", ethers.formatUnits(totalTokensBought, 18), "tokens");

    if (totalTokensBought > 0) {
      console.log("Average Price:", ethers.formatEther(totalEthSpent * BigInt(1e18) / totalTokensBought), "ETH/token");
    } else {
      console.log("Average Price: N/A (no tokens bought)");
    }

    console.log("Final Price:", ethers.formatEther(await pool.calculateCurrentPrice()), "ETH/token");
    console.log("Price Increase:",
      initialPrice > 0 ? ((Number(await pool.calculateCurrentPrice()) - Number(initialPrice)) / Number(initialPrice) * 100).toFixed(2) : "N/A", // Check for initialPrice > 0
      "%"
    );
  });

  it("Token 2 price changes with multiple buys", async () => {
    console.log(`\n--- TOKEN 2 ${token2Address} MULTIPLE BUYS PRICE IMPACT TEST ---`);
    const pool = await ethers.getContractAt("BondingCurvePool", token2Address);

    // Initial state
    const initialPrice = await pool.initialTokenPrice(); // Use stored initial price
    console.log("\nInitial Price for Token 2 multiple buys:", ethers.formatEther(initialPrice), "ETH/token");

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
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.03"),   // 0.03 ETH
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.02"),   // 0.02 ETH
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.1"),   // 0.1 ETH
      ethers.parseEther("0.05"),  // 0.05 ETH
      ethers.parseEther("0.06")    // 0.06 ETH
    ];

    let totalTokensBought = 0n;
    let totalEthSpent = 0n;

    console.log("\nBuy # | ETH Amount | Tokens Received | Price After Buy | Total Tokens | Total ETH Spent");
    console.log("------|------------|-----------------|-----------------|--------------|----------------");

    for (let i = 0; i < buyAmounts.length; i++) {
      const buyAmount = buyAmounts[i];

      try {
        // Simulate fee calculation to get netEthForCurve for calculateBuyReturn
        const LOTTERY_POOL_FEE_NUMERATOR = 30n;
        const LOTTERY_POOL_FEE_DENOMINATOR = 100n;
        const HOLDER_POOL_FEE_NUMERATOR = 111n;
        const HOLDER_POOL_FEE_DENOMINATOR = 10000n;
        const PROTOCOL_POOL_FEE_NUMERATOR = 111n;
        const PROTOCOL_POOL_FEE_DENOMINATOR = 10000n;
        const DEV_FEE_NUMERATOR = 111n;
        const DEV_FEE_DENOMINATOR = 10000n;

        let totalFeesPaidForThisBuy = 0n;
        const isLotteryTaxActive = await pool.isLotteryTaxActive();
        if (isLotteryTaxActive) {
            const lotteryFee = (buyAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
            totalFeesPaidForThisBuy += lotteryFee;
        }
        const holderFee = (buyAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += holderFee;
        const protocolFee = (buyAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += protocolFee;
        const devFee = (buyAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
        totalFeesPaidForThisBuy += devFee;
        
        const netEthForCurveForThisBuy = buyAmount - totalFeesPaidForThisBuy;
        
        // Calculate expected tokens before buying, based on net ETH
        const expectedTokens = await pool.calculateBuyReturn(netEthForCurveForThisBuy);

        // Get price before buy
        const priceBeforeBuy = await pool.calculateCurrentPrice();

        // Check max allowed buy (without making a transaction)
        // Get the current lotteryPool and ethRaised values
        const lotteryPool = await pool.lotteryPool();
        const ethRaised = await pool.ethRaised();
        const maxBuy = (lotteryPool - ethRaised) * 10n / 100n; // 10% of remaining pool

        if (buyAmount > maxBuy) {
          console.log(
            `${(i + 1).toString().padStart(4)} | ` +
            `${ethers.formatEther(buyAmount).padStart(10)} | ` +
            `SKIPPED - Exceeds maximum buy of ${ethers.formatEther(maxBuy)} ETH (10% of remaining pool)`
          );
          continue;
        }

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
      } catch (error) {
        // If we hit an error, log it and continue with the next amount
        console.log(
          `${(i + 1).toString().padStart(4)} | ` +
          `${ethers.formatEther(buyAmount).padStart(10)} | ` +
          `ERROR: ${error.message}`
        );

        // Optional: If you want to stop the test after first error
        // break;
      }
    }

    // Print summary
    console.log("\nSummary:");
    console.log("Total ETH Spent:", ethers.formatEther(totalEthSpent), "ETH");
    console.log("Total Tokens Bought:", ethers.formatUnits(totalTokensBought, 18), "tokens");

    if (totalTokensBought > 0) {
      console.log("Average Price:", ethers.formatEther(totalEthSpent * BigInt(1e18) / totalTokensBought), "ETH/token");
    } else {
      console.log("Average Price: N/A (no tokens bought)");
    }

    console.log("Final Price:", ethers.formatEther(await pool.calculateCurrentPrice()), "ETH/token");
    console.log("Price Increase:",
      initialPrice > 0 ? ((Number(await pool.calculateCurrentPrice()) - Number(initialPrice)) / Number(initialPrice) * 100).toFixed(2) : "N/A", // Check for initialPrice > 0
      "%"
    );
  });
});

describe("GIVEN_TEST Simulation Comparison", function () {
  let launchpad, pool, poolAddress;
  let owner, buyer, user2, treasury;

  // Parameters from GIVEN_TEST simulation
  const GIVEN_TEST_INITIAL_SUPPLY_BASE = 1_000_000_000n;
  const GIVEN_TEST_TOTAL_SUPPLY_WEI = ethers.parseUnits(GIVEN_TEST_INITIAL_SUPPLY_BASE.toString(), 18);

  // GIVEN_TEST new lottery_pool_target_eth = 3.333333 ETH (significantly smaller)
  const GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR = "3.333333"; // Updated from (100 / 0.3).toString();
  const GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_WEI = ethers.parseEther(GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR);

  // To make Solidity's effectiveLiquidityTargetForCurveSetup match GIVEN_TEST's, 
  // _initialLotteryPool_sol * 3 = GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH
  // So, _initialLotteryPool_sol = GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH / 3
  const SOLIDITY_INITIAL_LOTTERY_POOL_ETH_NUM_STR = (parseFloat(GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR) / 3).toString(); // Updated
  const SOLIDITY_INITIAL_LOTTERY_POOL_WEI = ethers.parseEther(SOLIDITY_INITIAL_LOTTERY_POOL_ETH_NUM_STR);

  // GIVEN_TEST new initial price = GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH / GIVEN_TEST_INITIAL_SUPPLY_BASE
  const GIVEN_TEST_INITIAL_PRICE_ETH_PER_TOKEN_NUM_STR = (parseFloat(GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR) / Number(GIVEN_TEST_INITIAL_SUPPLY_BASE) ).toFixed(18); // Updated

  // GIVEN_TEST's s_migrated (tokens available for curve) = 0.8 * GIVEN_TEST_INITIAL_SUPPLY_BASE (remains 800M)
  const GIVEN_TEST_S_MIGRATED_BASE = GIVEN_TEST_INITIAL_SUPPLY_BASE * 8n / 10n; // 800,000,000

  // GIVEN_TEST's pre-adjustment virtual reserves (from new output)
  // v_tokens: 4,000,000,000, v_eth: 13.333333
  const GIVEN_TEST_VTOKENS_PRE_ADJ_STR = "4000000000"; // Updated from calculation
  const GIVEN_TEST_VETH_PRE_ADJ_STR = "13.333333"; // Updated from calculation

  // GIVEN_TEST's post-adjustment virtual reserves (from new simulation output)
  const GIVEN_TEST_VTOKENS_POST_ADJ_STR = "2424242424"; 
  const GIVEN_TEST_VETH_POST_ADJ_NUM_STR = "8.080808";

  // Fee constants from Pool.sol for calculating netEthForCurve
  const LOTTERY_POOL_FEE_NUMERATOR = 30n;
  const LOTTERY_POOL_FEE_DENOMINATOR = 100n;
  const HOLDER_POOL_FEE_NUMERATOR = 111n;
  const HOLDER_POOL_FEE_DENOMINATOR = 10000n;
  const PROTOCOL_POOL_FEE_NUMERATOR = 111n;
  const PROTOCOL_POOL_FEE_DENOMINATOR = 10000n;
  const DEV_FEE_NUMERATOR = 111n;
  const DEV_FEE_DENOMINATOR = 10000n;

  before(async () => {
    [owner, buyer, user2, treasury] = await ethers.getSigners();
    const TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
    launchpad = await TokenLaunchpad.deploy(owner.address);

    const tx = await launchpad.launchToken(
      "PySimToken",
      "PST",
      SOLIDITY_INITIAL_LOTTERY_POOL_WEI,
      treasury.address
    );
    const receipt = await tx.wait();
    const events = await launchpad.queryFilter(launchpad.filters.TokenCreated(), receipt.blockNumber);
    poolAddress = events[0].args.tokenAddress;
    pool = await ethers.getContractAt("BondingCurvePool", poolAddress);
  });

  it("should compare behavior with the GIVEN_TEST simulation step-by-step", async function () {
    console.log("\n--- GIVEN_TEST Simulation Comparison Test ---");
    console.log(`Solidarity Initial Lottery Pool (constructor arg): ${ethers.formatEther(SOLIDITY_INITIAL_LOTTERY_POOL_WEI)} ETH`);
    console.log(`This implies Solidity Effective Liquidity Target for Curve Setup: ${ethers.formatEther(SOLIDITY_INITIAL_LOTTERY_POOL_WEI * 3n)} ETH (matches GIVEN_TEST's ${GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR} ETH)`);
    console.log(`Solidity Lottery Pool (for tax & migration ETH target): ${ethers.formatEther(await pool.lotteryPool())} ETH`);
    console.log(`GIVEN_TEST Migration ETH Target was: ${GIVEN_TEST_EFFECTIVE_LIQUIDITY_TARGET_ETH_NUM_STR} ETH`);

    // Section 1: Initial Parameter Comparison
    console.log("\n--- Section 1: Initial Parameter Comparison ---");
    const sol_initialTokenPrice = await pool.initialTokenPrice();
    const sol_virtualTokenReserve = await pool.virtualTokenReserve();
    const sol_virtualEthReserve = await pool.virtualEthReserve();
    const sol_constant_k = await pool.constant_k();

    console.log(`GIVEN_TEST Calculated Initial Price (unscaled): ${GIVEN_TEST_INITIAL_PRICE_ETH_PER_TOKEN_NUM_STR} ETH/token`);
    console.log(`Solidity Stored initialTokenPrice (scaled by 1e18): ${sol_initialTokenPrice.toString()}`);
    console.log(`   Solidity Initial Price (unscaled for comparison): ${ethers.formatUnits(sol_initialTokenPrice, 18)}`);
  
    console.log(`GIVEN_TEST Pre-Adjustment v_tokens (base): ${GIVEN_TEST_VTOKENS_PRE_ADJ_STR}`);
    console.log(`Solidity virtualTokenReserve: ${ethers.formatUnits(sol_virtualTokenReserve, 18)}`);
    console.log(`GIVEN_TEST Pre-Adjustment v_eth (ETH): ${GIVEN_TEST_VETH_PRE_ADJ_STR}`);
    console.log(`Solidity virtualEthReserve: ${ethers.formatEther(sol_virtualEthReserve)}`);
    console.log(`Solidity constant_k: ${ethers.formatEther(sol_constant_k)}`);

    // Note: To get maxEthPossible from CurveVerification, you might need to listen to the event upon deployment in beforeEach or add a view function.
    // For this example, we'll use the GIVEN_TEST script's reported pre-adjustment max ETH.
    console.log("GIVEN_TEST Max ETH that can be raised (pre-adjustment, from new output): 2.222222 ETH"); // Updated
    console.log("Solidity would calculate a similar value before any adjustment (not implemented).");

    console.log("\nGIVEN_TEST performs an adjustment to virtual reserves:");
    console.log(`   GIVEN_TEST Adjusted v_tokens: ${GIVEN_TEST_VTOKENS_POST_ADJ_STR}`);
    console.log(`   GIVEN_TEST Adjusted v_eth: ${GIVEN_TEST_VETH_POST_ADJ_NUM_STR} ETH`);
    console.log("Solidity contract DOES NOT perform this specific adjustment. It uses the unadjusted reserves calculated above.");
    console.log("Subsequent buy/sell comparisons will show differences due to this initial state divergence and fee mechanisms.");

    // GIVEN_TEST simulation's "Initial State" is post-adjustment.
    // Solidity's initial state is what we logged above (unadjusted by GIVEN_TEST's verification logic).

    // Section 2: Buy Simulation
    console.log("\n--- Section 2: Buy Simulation ---");
    const buy_actions = [
        { desc: "Small buy 1", eth_amount_str: "0.01", py_tokens_received_str: "2996292", py_new_price_str: "0.000000003341588438", py_new_vtokens_str: "2421246132", py_new_veth_str: "8.090808" },
        { desc: "Small buy 2", eth_amount_str: "0.05", py_tokens_received_str: "14871043", py_new_price_str: "0.000000003383017102", py_new_vtokens_str: "2406375089", py_new_veth_str: "8.140808" },
        { desc: "Medium buy 1", eth_amount_str: "0.07", py_tokens_received_str: "20515186", py_new_price_str: "0.000000003441446026", py_new_vtokens_str: "2385859903", py_new_veth_str: "8.210808" },
        { desc: "Medium buy 2", eth_amount_str: "0.07", py_tokens_received_str: "20168345", py_new_price_str: "0.000000003500375208", py_new_vtokens_str: "2365691558", py_new_veth_str: "8.280808" },
        { desc: "Larger buy 1", eth_amount_str: "0.25", py_tokens_received_str: "69327886", py_new_price_str: "0.000000003714920326", py_new_vtokens_str: "2296363672", py_new_veth_str: "8.530808" },
    ];

    for (const action of buy_actions) {
        console.log(`\n--- Simulating: ${action.desc} (${action.eth_amount_str} ETH) ---`);
        const grossEthAmount = ethers.parseEther(action.eth_amount_str);

        let totalFeesPaid = 0n;
        const isLotteryTaxActive = await pool.isLotteryTaxActive();
        if (isLotteryTaxActive) {
            const lotteryFee = (grossEthAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
            totalFeesPaid += lotteryFee;
        }
        const holderFee = (grossEthAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
        totalFeesPaid += holderFee;
        const protocolFee = (grossEthAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
        totalFeesPaid += protocolFee;
        const devFee = (grossEthAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
        totalFeesPaid += devFee;
        const netEthForCurve = grossEthAmount - totalFeesPaid;

        console.log(`   Solidity: Gross ETH: ${ethers.formatEther(grossEthAmount)}, Fees: ${ethers.formatEther(totalFeesPaid)}, Net ETH for Curve: ${ethers.formatEther(netEthForCurve)}`);
      
        const expectedTokens_s = await pool.calculateBuyReturn(netEthForCurve);
        console.log(`   Solidity: Expected tokens for net ETH: ${ethers.formatUnits(expectedTokens_s, 18)}`);
      
        const buyerBalanceBefore = await pool.balanceOf(buyer.address);
        await pool.connect(buyer).buy({ value: grossEthAmount });
        const buyerBalanceAfter = await pool.balanceOf(buyer.address);
        const tokensReceived_s = buyerBalanceAfter - buyerBalanceBefore;

        console.log(`   GIVEN_TEST Reported Tokens Received: ${action.py_tokens_received_str}`);
        console.log(`   Solidity Actual Tokens Received: ${ethers.formatUnits(tokensReceived_s, 18)} (Note: Based on net ETH and Solidity's unadjusted reserves)`);
      
        const price_s_new = await pool.calculateCurrentPrice();
        const vTR_S_new = await pool.virtualTokenReserve();
        const vER_S_new = await pool.virtualEthReserve();
        const ethRaised_s = await pool.ethRaised();

        console.log(`   GIVEN_TEST New Price: ${action.py_new_price_str}`);
        console.log(`   Solidity New Price: ${ethers.formatUnits(price_s_new, 18)}`);
        console.log(`   GIVEN_TEST New v_tokens: ${action.py_new_vtokens_str}`);
        console.log(`   Solidity New virtualTokenReserve: ${ethers.formatUnits(vTR_S_new, 18)}`);
        console.log(`   GIVEN_TEST New v_eth: ${action.py_new_veth_str}`);
        console.log(`   Solidity New virtualEthReserve: ${ethers.formatEther(vER_S_new)}`);
        console.log(`   Solidity ethRaised: ${ethers.formatEther(ethRaised_s)}`);
    }

    // Section 3: Sell Simulation
    console.log("\n--- Section 3: Sell Simulation ---");
    // GIVEN_TEST output shows Real ETH (Collected in Contract) becoming negative after sells,
    // which implies its `r_eth` is not bounded by contract balance or actual raised ETH.
    // Solidity's sell will fail if contract ETH balance is insufficient or ethToReturn > ethRaised.
    const sell_actions = [
        // GIVEN_TEST r_tokens after buys was 872,121,248. Solidity's sold token count will differ.
        { desc: "Small sell", py_token_amount_str: "5000000", py_eth_received_str: "0.018534", py_new_price_str: "0.000000003698795604", py_new_vtokens_str: "2301363672", py_new_veth_str: "8.512274" },
        { desc: "Medium sell", py_token_amount_str: "10000000", py_eth_received_str: "0.036828", py_new_price_str: "0.000000003666859528", py_new_vtokens_str: "2311363672", py_new_veth_str: "8.475446" },
    ];

    for (const action of sell_actions) {
        const tokensToSell_s_base = BigInt(action.py_token_amount_str);
        const tokensToSell_s_wei = ethers.parseUnits(action.py_token_amount_str, 18);
        console.log(`\n--- Simulating: ${action.desc} (${action.py_token_amount_str} tokens) ---`);

        const buyerTokenBalance = await pool.balanceOf(buyer.address);
        if (buyerTokenBalance < tokensToSell_s_wei) {
            console.log(`   Solidity: Buyer has insufficient tokens (${ethers.formatUnits(buyerTokenBalance,18)}) to sell ${action.py_token_amount_str}. Skipping sell.`);
            continue;
        }

        const expectedEth_s = await pool.calculateSellReturn(tokensToSell_s_wei);
        console.log(`   Solidity: Expected ETH for selling ${action.py_token_amount_str} tokens: ${ethers.formatEther(expectedEth_s)}`);

        const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
        const contractEthBalanceBefore = await ethers.provider.getBalance(poolAddress);
        const sellTx = await pool.connect(buyer).sell(tokensToSell_s_wei);
        const sellReceipt = await sellTx.wait();
        const gasCost = sellReceipt.gasUsed * sellReceipt.gasPrice;
        const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
        const ethReceived_s_actual = buyerEthBalanceAfter - buyerEthBalanceBefore + gasCost;

        console.log(`   GIVEN_TEST Reported ETH Received: ${action.py_eth_received_str}`);
        console.log(`   Solidity Actual ETH Received (approx, after gas): ${ethers.formatEther(ethReceived_s_actual)}`);
      
        const price_s_after_sell = await pool.calculateCurrentPrice();
        const vTR_S_after_sell = await pool.virtualTokenReserve();
        const vER_S_after_sell = await pool.virtualEthReserve();
        const ethRaised_s_after_sell = await pool.ethRaised();

        console.log(`   GIVEN_TEST New Price after sell: ${action.py_new_price_str}`);
        console.log(`   Solidity New Price after sell: ${ethers.formatUnits(price_s_after_sell, 18)}`);
        console.log(`   GIVEN_TEST New v_tokens after sell: ${action.py_new_vtokens_str}`);
        console.log(`   Solidity New virtualTokenReserve after sell: ${ethers.formatUnits(vTR_S_after_sell, 18)}`);
        console.log(`   GIVEN_TEST New v_eth after sell: ${action.py_new_veth_str}`);
        console.log(`   Solidity New virtualEthReserve after sell: ${ethers.formatEther(vER_S_after_sell)}`);
        console.log(`   Solidity ethRaised after sell: ${ethers.formatEther(ethRaised_s_after_sell)}`);
    }
    console.log("\n--- Comparison Test Complete ---");
  });
});
