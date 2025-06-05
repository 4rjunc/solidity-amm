const { expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers; // This is an ethers v6 object

// Ethers v6 style for utility functions:
const parseEther = ethers.parseEther;
const formatEther = ethers.formatEther;
const formatUnits = ethers.formatUnits;

// Constants from Pool.sol for reference and calculation (using BigInt)
const INITIAL_SUPPLY_POOL = 1000000000n * (10n ** 18n); // 1 Billion tokens
const RESERVED_SUPPLY_PERCENTAGE_POOL = 20; // This remains a regular number for percentage math
const ONE_ETHER_POOL = 10n ** 18n;

async function logPoolState(poolInstance, userSigner, stepName = "") {
    const name = await poolInstance.name();
    const symbol = await poolInstance.symbol();
    const currentPrice = await poolInstance.calculateCurrentPrice();
    const initialSupply = await poolInstance.INITIAL_SUPPLY();

    // MarketCap (in ETH terms, scaled by 1e18) = (TotalSupply_scaled * Price_scaled) / 1e18
    const marketCap = initialSupply * currentPrice / ONE_ETHER_POOL;

    const ethRaised = await poolInstance.ethRaised();
    const lotteryPoolTarget = await poolInstance.lotteryPool();
    
    const contractTokenBalance = await poolInstance.balanceOf(poolInstance.target);
    const contractEthBalance = await ethers.provider.getBalance(poolInstance.target);
    
    const virtualTokenReserve = await poolInstance.virtualTokenReserve();
    const virtualEthReserve = await poolInstance.virtualEthReserve();
    
    const accLotteryTax = await poolInstance.accumulatedLotteryTax();
    const accHolderTax = await poolInstance.accumulatedHolderTax();
    const accProtocolTax = await poolInstance.accumulatedProtocolTax();
    const accDevTax = await poolInstance.accumulatedDevTax();

    const isLotteryTaxActive = await poolInstance.isLotteryTaxActive();
    const isReservedSupplyActive = await poolInstance.isReservedSupplyActive();
    const totalTokensSoldFromCurve = await poolInstance.totalTokensSoldFromCurve();
    const k_constant = await poolInstance.constant_k();

    console.log(`\n--- State after: ${stepName} ---`);
    console.log(`Token: ${name} (${symbol})`);
    console.log(`1. Market Cap: ${formatEther(marketCap)} ETH`);
    console.log(`2. Token Price: ${formatEther(currentPrice)} ETH/token`);
    console.log(`3. ETH Raised (Net to Curve): ${formatEther(ethRaised)}`);
    console.log(`   Lottery Pool Progress (Tax): ${formatEther(accLotteryTax)} / ${formatEther(lotteryPoolTarget)} (Target)`);
    console.log(`4. Tokens in Contract: ${formatUnits(contractTokenBalance, 18)}`);
    console.log(`5. ETH in Contract: ${formatEther(contractEthBalance)} ETH`);
    console.log(`6. Virtual Tokens: ${formatUnits(virtualTokenReserve, 18)}`);
    console.log(`   Virtual ETH: ${formatEther(virtualEthReserve)} ETH`);
    console.log(`   Constant K (scaled by 1e18): ${formatUnits(k_constant, 18)}`);
    console.log(`7. Tax Pools:`);
    console.log(`   - Lottery: ${formatEther(accLotteryTax)} ETH (Tax Active: ${isLotteryTaxActive})`);
    console.log(`   - Holder: ${formatEther(accHolderTax)} ETH`);
    console.log(`   - Protocol: ${formatEther(accProtocolTax)} ETH`);
    console.log(`   - Dev: ${formatEther(accDevTax)} ETH`);
    console.log(`---`);
    console.log(`Total Tokens Sold from Curve: ${formatUnits(totalTokensSoldFromCurve, 18)}`);
    console.log(`Tokens available for initial curve: ${formatUnits(await poolInstance.getTokensForInitialCurvePhase(), 18)}`);
    console.log(`Reserved Supply Active: ${isReservedSupplyActive}`);
    
    if (userSigner && userSigner.address) {
        const userTokenBalance = await poolInstance.balanceOf(userSigner.address);
        const userEthBalance = await ethers.provider.getBalance(userSigner.address);
        console.log(`User (${userSigner.address.substring(0,10)}...) Token Balance: ${formatUnits(userTokenBalance, 18)}`);
        console.log(`User (${userSigner.address.substring(0,10)}...) ETH Balance: ${formatEther(userEthBalance)} ETH`);
    }
    console.log(`---------------------------\n`);
}


describe("TokenLaunchpad", function () {
    let TokenLaunchpad, launchpad, owner, addr1;
    const tokenName = "TestToken";
    const tokenSymbol = "TST";
    const initialLotteryPool = parseEther("10"); // 10 ETH

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
        launchpad = await TokenLaunchpad.deploy(owner.address);
        await launchpad.waitForDeployment();
    });

    it("Should allow owner to launch a new token", async function () {
        await expect(launchpad.connect(owner).launchToken(tokenName, tokenSymbol, initialLotteryPool))
            .to.emit(launchpad, "TokenCreated")
            .withArgs(ethers.isAddress, tokenName, tokenSymbol); // Check address with a predicate

        const tokens = await launchpad.getAllTokens();
        expect(tokens.length).to.equal(1);
        expect(tokens[0].name).to.equal(tokenName);
        expect(tokens[0].symbol).to.equal(tokenSymbol);
        expect(tokens[0].tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should not allow non-owner to launch a new token", async function () {
        await expect(launchpad.connect(addr1).launchToken(tokenName, tokenSymbol, initialLotteryPool))
            .to.be.revertedWithCustomError(launchpad, "OwnableUnauthorizedAccount")
            .withArgs(addr1.address);
    });

    it("Should retrieve all created tokens", async function () {
        await launchpad.connect(owner).launchToken("Token1", "TKN1", parseEther("5"));
        await launchpad.connect(owner).launchToken("Token2", "TKN2", parseEther("15"));

        const tokens = await launchpad.getAllTokens();
        expect(tokens.length).to.equal(2);
        expect(tokens[1].name).to.equal("Token2");
    });
});


describe("BondingCurvePool", function () {
    let BondingCurvePool, pool, launchpad, owner, buyer1, buyer2, seller1;
    const tokenName = "PoolToken";
    const tokenSymbol = "PTK";
    const initialLotteryPoolAmount = parseEther("10"); // 10 ETH, a common value for tests
    const minBuy = parseEther("0.001");

    beforeEach(async function () {
        [owner, buyer1, buyer2, seller1] = await ethers.getSigners();
        
        const TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
        launchpad = await TokenLaunchpad.deploy(owner.address);
        await launchpad.waitForDeployment();

        const tx = await launchpad.launchToken(tokenName, tokenSymbol, initialLotteryPoolAmount);
        const receipt = await tx.wait(); // Wait for the transaction to be mined

        let poolAddress;

        // Use contract.filters to get specific logs from the receipt
        // Create a filter for the TokenCreated event emitted by the launchpad contract
        // const eventFragment = launchpad.interface.getEvent("TokenCreated"); // This line can cause issues if event is overloaded or not found by this exact name string
        // A more direct way if event name is unique and simple:
        const filter = launchpad.filters.TokenCreated(); // Creates a filter for TokenCreated()
        
        // Filter the logs from the receipt using receipt.getLogs() if available and preferred
        // However, manually filtering and parsing can also work if done carefully.
        const decodedLogs = [];
        if (receipt && receipt.logs) {
            for (const log of receipt.logs) {
                 // Check if the log address matches the launchpad contract address
                if (log.address.toLowerCase() === (launchpad.target || launchpad.address).toLowerCase()) { // launchpad.target for ethers v6
                    try {
                        // Attempt to parse the log with the launchpad interface
                        const parsedLog = launchpad.interface.parseLog({ topics: Array.from(log.topics), data: log.data });
                        if (parsedLog && parsedLog.name === "TokenCreated") {
                            decodedLogs.push(parsedLog);
                        }
                    } catch (e) {
                        // Not a log from this interface or specific event
                    }
                }
            }
        }

        if (decodedLogs && decodedLogs.length > 0) {
            poolAddress = decodedLogs[0].args.tokenAddress; // Get address from the first matched event
        }

        expect(poolAddress, "Failed to find TokenCreated event or extract tokenAddress in logs").to.be.a('string');
        expect(ethers.isAddress(poolAddress), `poolAddress '${poolAddress}' from event is not a valid address`).to.be.true;
        
        BondingCurvePool = await ethers.getContractFactory("BondingCurvePool");
        pool = BondingCurvePool.attach(poolAddress); // Attach the contract instance to the obtained address
    });

    it("Should be deployed with correct initial parameters", async function () {
        expect(await pool.name()).to.equal(tokenName);
        expect(await pool.symbol()).to.equal(tokenSymbol);
        expect(await pool.lotteryPool()).to.equal(initialLotteryPoolAmount);
        // expect(await pool.owner()).to.equal(launchpad.address); // Pool.sol is not Ownable, and doesn't have an owner() function.

        const initialTokenPrice = await pool.initialTokenPrice();
        expect(initialTokenPrice).to.be.gt(0n);

        const totalSupply = await pool.totalSupply();
        expect(totalSupply).to.equal(INITIAL_SUPPLY_POOL);
        expect(await pool.balanceOf(pool.target)).to.equal(INITIAL_SUPPLY_POOL);

        const reservedSupply = INITIAL_SUPPLY_POOL * BigInt(RESERVED_SUPPLY_PERCENTAGE_POOL) / 100n;
        expect(await pool.reservedSupplyAmount()).to.equal(reservedSupply);

        expect(await pool.isLotteryTaxActive()).to.be.true;
        expect(await pool.isReservedSupplyActive()).to.be.false;

        // Check virtual reserves and k (should be initialized)
        expect(await pool.virtualTokenReserve()).to.be.gt(0n);
        expect(await pool.virtualEthReserve()).to.be.gt(0n);
        expect(await pool.constant_k()).to.be.gt(0n);

        console.log("Initial State of a newly deployed Pool:");
        await logPoolState(pool, owner, "Deployment");
    });

    it("Should reject deployment with invalid lottery pool sizes", async function () {
         const TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
         const newLaunchpad = await TokenLaunchpad.deploy(owner.address);
         await newLaunchpad.waitForDeployment();

        const tooSmallLottery = parseEther("0.001"); // MIN_LOTTERY_POOL is 0.01 ETH
        await expect(newLaunchpad.launchToken("BadSmall", "BS", tooSmallLottery))
            .to.be.revertedWith("Lottery pool too small");

        const tooLargeLottery = parseEther("121"); // MAX_LOTTERY_POOL is 120 ETH
        await expect(newLaunchpad.launchToken("BadLarge", "BL", tooLargeLottery))
            .to.be.revertedWith("Lottery pool too large");
    });

    it("calculateCurrentPrice should return a price", async function () {
        const price = await pool.calculateCurrentPrice();
        expect(price).to.be.gt(0n);
    });

    it("calculateBuyReturn should return tokens for ETH", async function () {
        const tokens = await pool.calculateBuyReturn(parseEther("1"));
        expect(tokens).to.be.gt(0n);
        await expect(pool.calculateBuyReturn(0n)).to.be.revertedWith("ETH amount must be > 0");
    });

    it("calculateSellReturn should return ETH for tokens", async function () {
        // Cannot directly test sell return without tokens, but can check logic with dummy values if contract allowed.
        // For now, just test the revert. We'll test actual sell after a buy.
        await expect(pool.calculateSellReturn(0n)).to.be.revertedWith("Token amount must be > 0");
        
        // A more direct test would involve setting virtual reserves for calculation if possible,
        // or buying then calculating sell.
        // If virtualTokenReserve is high, and we try to sell 1 token:
        const vTokens = await pool.virtualTokenReserve();
        const vEth = await pool.virtualEthReserve();
        const k = await pool.constant_k();

        if (vTokens > 0n && vEth > 0n && k > 0n) {
            const oneToken = parseEther("1"); // 1 token with 18 decimals
             // Ensure we have enough virtual tokens to sell from, hypothetically
            if (vTokens > oneToken) { // This check is simplified
                const ethFromSell = await pool.calculateSellReturn(oneToken);
                // Depending on curve state, this could be > 0 or 0 if price is extremely low or high.
                // For a healthy curve, it should be >0 if vEth > k / (vTokens + oneToken)
                // console.log("Calculated sell return for 1 token:", formatEther(ethFromSell));
                 expect(ethFromSell).to.be.gte(0n); // Can be 0 if price impact is total
            }
        }
    });

    it("Should allow a user to buy tokens", async function () {
        const buyAmountEth = parseEther("1");
        const initialEthBalanceBuyer = await ethers.provider.getBalance(buyer1.address);
        const initialPoolEthBalance = await ethers.provider.getBalance(pool.target);

        await logPoolState(pool, buyer1, "Before First Buy");

        const tx = await pool.connect(buyer1).buy({ value: buyAmountEth });
        const receipt = await tx.wait();
        
        const actualGasPrice = receipt.effectiveGasPrice ?? 0n;
        const gasCost = receipt.gasUsed * actualGasPrice;

        await expect(tx).to.emit(pool, "TokensPurchased");
        await logPoolState(pool, buyer1, "After First Buy (1 ETH)");

        const buyerTokenBalance = await pool.balanceOf(buyer1.address);
        expect(buyerTokenBalance).to.be.gt(0n);

        const finalEthBalanceBuyer = await ethers.provider.getBalance(buyer1.address);
        const expectedEthBalanceBuyer = initialEthBalanceBuyer - buyAmountEth - gasCost;
        const diff = finalEthBalanceBuyer > expectedEthBalanceBuyer ? finalEthBalanceBuyer - expectedEthBalanceBuyer : expectedEthBalanceBuyer - finalEthBalanceBuyer;
        expect(diff).to.be.lte(parseEther("0.001")); // Allow a small tolerance for gas variations

        expect(await ethers.provider.getBalance(pool.target)).to.equal(initialPoolEthBalance + buyAmountEth);
        
        expect(await pool.ethRaised()).to.be.gt(0n); // Net ETH for curve
        expect(await pool.totalTokensSoldFromCurve()).to.equal(buyerTokenBalance); // Assuming first buyer
        
        // Check fees accumulated
        expect(await pool.accumulatedLotteryTax()).to.be.gt(0n);
        expect(await pool.accumulatedHolderTax()).to.be.gt(0n);
        expect(await pool.accumulatedProtocolTax()).to.be.gt(0n);
        expect(await pool.accumulatedDevTax()).to.be.gt(0n);
    });

    it("Should reject buys below minimum ETH", async function () {
        const belowMinBuy = parseEther("0.0001");
        await expect(pool.connect(buyer1).buy({ value: belowMinBuy }))
            .to.be.revertedWith("Below minimum buy amount");
    });

    it("Should allow a user to sell tokens after buying", async function () {
        const buyAmountEth = parseEther("1");
        await pool.connect(buyer1).buy({ value: buyAmountEth });
        const tokensBought = await pool.balanceOf(buyer1.address);
        expect(tokensBought).to.be.gt(0n);

        await logPoolState(pool, buyer1, "Before Sell");

        const initialEthBalanceSeller = await ethers.provider.getBalance(buyer1.address);
        const initialPoolEthBalanceBeforeSell = await ethers.provider.getBalance(pool.target);
        const initialPoolTokenBalance = await pool.balanceOf(pool.target);

        const tokensToSell = tokensBought / 2n;
        
        const tx = await pool.connect(buyer1).sell(tokensToSell);
        const receipt = await tx.wait();
        
        const actualGasPrice = receipt.effectiveGasPrice ?? 0n;
        const gasCost = receipt.gasUsed * actualGasPrice;
        
        await expect(tx).to.emit(pool, "TokensSold");
        await logPoolState(pool, buyer1, `After Selling ${formatUnits(tokensToSell, 18)} tokens`);

        const finalTokenBalance = await pool.balanceOf(buyer1.address);
        expect(finalTokenBalance).to.equal(tokensBought - tokensToSell);
        
        expect(await ethers.provider.getBalance(buyer1.address)).to.be.gt(initialEthBalanceSeller - gasCost);
        expect(await pool.balanceOf(pool.target)).to.equal(initialPoolTokenBalance + tokensToSell);
    });

    it("Should reject selling 0 tokens or more tokens than owned", async function () {
        await expect(pool.connect(buyer1).sell(0n)).to.be.revertedWith("Must sell more than 0 tokens");
        
        const tokensToSell = parseEther("100"); // 100 tokens
        await expect(pool.connect(buyer1).sell(tokensToSell)) // Buyer1 has 0 tokens initially
            .to.be.revertedWith("Not enough tokens to sell");

        // Buy some, then try to sell more
        await pool.connect(buyer1).buy({ value: parseEther("0.1") });
        const balance = await pool.balanceOf(buyer1.address);
        await expect(pool.connect(buyer1).sell(balance + 1n))
            .to.be.revertedWith("Not enough tokens to sell");
    });
    
    it("addToLotteryPool should increase lotteryPool and re-initialize curve if called before activation", async function () {
        const initialLottery = await pool.lotteryPool();
        const initialVToken = await pool.virtualTokenReserve();
        const initialVEth = await pool.virtualEthReserve();
        const initialK = await pool.constant_k();

        const amountToAdd = parseEther("1");
        // This function is on the Pool contract, which is owned by Launchpad.
        // To call it, owner of Launchpad needs to call a function on Launchpad,
        // or Pool needs to be Ownable by an EOA.
        // Current Pool.sol has `addToLotteryPool` as external payable.
        // And no Ownable modifier. So anyone can call it.
        
        await expect(pool.connect(owner).addToLotteryPool({ value: amountToAdd }))
            .to.emit(pool, "LotteryPoolUpdated")
            .withArgs(initialLottery + amountToAdd);
        
        expect(await pool.lotteryPool()).to.equal(initialLottery + amountToAdd);

        // _initializeCurveFirstPhase is called, parameters should change
        expect(await pool.virtualTokenReserve()).to.not.equal(initialVToken);
        expect(await pool.virtualEthReserve()).to.not.equal(initialVEth);
        expect(await pool.constant_k()).to.not.equal(initialK);

        await logPoolState(pool, owner, "After addToLotteryPool");

        await expect(pool.connect(owner).addToLotteryPool({ value: 0n }))
            .to.be.revertedWith("Must add positive ETH amount to lottery pool");
            
        const currentLotteryMax = parseEther("120");
        const currentLottery = await pool.lotteryPool();
        const tooMuchToAdd = currentLotteryMax - currentLottery + parseEther("1"); // Ensure it's positive before checking
         if (tooMuchToAdd > 0n) {
            await expect(pool.connect(owner).addToLotteryPool({ value: tooMuchToAdd }))
                .to.be.revertedWith("Would exceed maximum lottery pool");
        }
    });


    describe("Simulations", function () {
        const tokensForInitialPhase = INITIAL_SUPPLY_POOL * BigInt(100 - RESERVED_SUPPLY_PERCENTAGE_POOL) / 100n; // 800M
        const reservedTokens = INITIAL_SUPPLY_POOL - tokensForInitialPhase; // 200M

        it("Simulation 1: Reach lotteryPool target (accumulatedLotteryTax >= lotteryPool)", async function () {
            console.log("--- Simulation 1: Reaching Lottery Pool Target ---");
            await logPoolState(pool, buyer1, "Sim1 Start");

            const targetLotteryTax = await pool.lotteryPool();
            let accumulatedLottery = await pool.accumulatedLotteryTax();
            let buysMade = 0;

            // Buy in chunks until lottery tax target is met
            // Lottery tax is 30% (LOTTERY_POOL_FEE_NUMERATOR = 30, DENOMINATOR = 100)
            while (accumulatedLottery < targetLotteryTax && buysMade < 50) { // Safety break
                const neededTax = targetLotteryTax - accumulatedLottery;
                // Gross ETH needed for that tax = neededTax / 0.3 = neededTax * 100 / 30
                let buyEthAmount = neededTax * 100n / 30n;
                
                if (buyEthAmount < minBuy) { // Ensure min buy
                    buyEthAmount = minBuy;
                }
                // Cap buy amount to avoid huge single buys, e.g., 1 ETH at a time if needed is large
                if (buyEthAmount > parseEther("1")) {
                    buyEthAmount = parseEther("1");
                }
                 // Check if buyer has enough ETH (Hardhat signers have a lot by default)

                console.log(`Buy #${buysMade + 1}: Attempting to buy with ${formatEther(buyEthAmount)} ETH to meet lottery tax.`);
                const buyTx = await pool.connect(buyer1).buy({ value: buyEthAmount });
                const receipt = await buyTx.wait();
                
                const purchasedEvent = receipt.logs.find(e => e?.eventName === 'TokensPurchased');
                const lotteryFeeApplied = purchasedEvent?.args.lotteryFeeApplied || 0n;

                accumulatedLottery = await pool.accumulatedLotteryTax();
                buysMade++;
                await logPoolState(pool, buyer1, `Sim1 Buy #${buysMade} (Paid ${formatEther(buyEthAmount)}, Lottery Fee: ${formatEther(lotteryFeeApplied)})`);

                if (await pool.isLotteryTaxActive() === false) {
                    console.log("Lottery tax became inactive.");
                    expect(await pool.isReservedSupplyActive()).to.be.true; // Should trigger reserved supply
                    break; 
                }
            }

            expect(await pool.isLotteryTaxActive()).to.be.false;
            expect(await pool.isReservedSupplyActive()).to.be.true;
            expect(await pool.accumulatedLotteryTax()).to.be.gte(targetLotteryTax);
            console.log("--- Simulation 1 End ---");
        });


        it("Simulation 2 & 3: Sell 800M initial tokens, then 200M reserved tokens", async function () {
            console.log("\n--- Simulation 2 & 3: Selling All Tokens ---");
            
            let currentAccLotteryTax = await pool.accumulatedLotteryTax();
            const targetLotteryTax = await pool.lotteryPool();
            let prelimBuys = 0;

            if (!(await pool.isReservedSupplyActive())) {
                console.log("Activating reserved supply first by meeting lottery target...");
                 while (currentAccLotteryTax < targetLotteryTax && prelimBuys < 60) { // Increased safety break to 60
                    const neededTax = targetLotteryTax - currentAccLotteryTax;
                    let buyEthAmount = minBuy; // Default to minBuy

                    if (neededTax > 0n) { // Only calculate if more tax is needed
                        buyEthAmount = neededTax * 100n / 30n; // Assuming 30% tax
                        if (buyEthAmount <= 0n) { // If calculation results in zero or less (due to precision with small neededTax)
                            buyEthAmount = minBuy; // Use minBuy to ensure progress
                        } else if (buyEthAmount < minBuy) {
                            buyEthAmount = minBuy;
                        }
                    }
                    
                    // Cap individual buys if calculated amount is too large for one step
                    if (buyEthAmount > parseEther("1")) {
                         buyEthAmount = parseEther("1");
                    }

                    // console.log(`Sim2/3 Prelim Buy #${prelimBuys + 1}: Attempting to buy with ${formatEther(buyEthAmount)} ETH. NeededTax: ${formatEther(neededTax)}`);
                    await pool.connect(buyer2).buy({ value: buyEthAmount });
                    currentAccLotteryTax = await pool.accumulatedLotteryTax();
                    prelimBuys++;
                    if (await pool.isLotteryTaxActive() === false) {
                         console.log("Lottery tax became inactive during prelim buys.");
                         break;
                    }
                }
                // Fallback: if loop finished by count but target not met, try one last precise or minBuy.
                if (await pool.isLotteryTaxActive() && currentAccLotteryTax < targetLotteryTax && prelimBuys >= 60) {
                    console.log("Preliminary buys reached limit, trying one more small/precise buy to meet target.");
                    const finalNeededTax = targetLotteryTax - currentAccLotteryTax;
                    let finalBuyAmount = minBuy;
                    if (finalNeededTax > 0n) {
                        finalBuyAmount = finalNeededTax * 100n / 30n;
                        if (finalBuyAmount <= 0n) finalBuyAmount = minBuy;
                        if (finalBuyAmount < minBuy) finalBuyAmount = minBuy;
                    }
                    // console.log(`Sim2/3 Final Prelim Buy: Attempting to buy with ${formatEther(finalBuyAmount)} ETH.`);
                    await pool.connect(buyer2).buy({ value: finalBuyAmount });
                }

                console.log(`Preliminary buys to activate reserved supply: ${prelimBuys}`);
                await logPoolState(pool, buyer2, "Sim2/3 After ensuring reserved supply active");
            }
            expect(await pool.isReservedSupplyActive(), "Reserved supply should be active after preliminary buys").to.be.true;
            expect(await pool.isLotteryTaxActive(), "Lottery tax should be inactive after preliminary buys").to.be.false;

            // Scenario 2b: Sell initial 800M tokens (actually, until total sold reaches this amount)
            console.log("\n--- Scenario 2b: Selling initial phase tokens (up to 800M total sold) ---");
            let totalTokensSold = await pool.totalTokensSoldFromCurve();
            let buysFor800M = 0;

            const targetSold800M = INITIAL_SUPPLY_POOL * 80n / 100n; // 800M tokens

            while(totalTokensSold < targetSold800M && buysFor800M < 200) { // Extended safety break
                const remainingToSellFor800M = targetSold800M - totalTokensSold;
                let buyEthAmount = parseEther("10"); // Buy with 10 ETH chunks to speed up. Max 120 ETH lottery pool.
                                                // Max 120ETH pool, so total "effective liquidity" for curve setup is 360ETH
                                                // This should be enough to move significantly.

                if (buyEthAmount < minBuy) buyEthAmount = minBuy;

                const buyer = (buysFor800M % 2 === 0) ? buyer1 : buyer2; // Alternate buyers

                try {
                    const tx = await pool.connect(buyer).buy({value: buyEthAmount});
                    await tx.wait();
                    totalTokensSold = await pool.totalTokensSoldFromCurve();
                    buysFor800M++;
                    if (buysFor800M % 5 === 0 || totalTokensSold >= targetSold800M) { // Log every 5 buys or if target met
                         await logPoolState(pool, buyer, `Sim2b Buy #${buysFor800M}, Total Sold: ${formatUnits(totalTokensSold, 18)}`);
                    }
                } catch (e) {
                    console.error("Error during buy in Sim2b, possible depletion or other issue:", e.message);
                    if (e.message.includes("Purchase exceeds total available supply for curve") || e.message.includes("Would receive zero tokens")) {
                         console.log("Reached effective supply limit for current curve state or price too high.");
                         break;
                    }
                    throw e; // re-throw if unexpected
                }
                
                const contractSupply = await pool.balanceOf(pool.target);
                if (contractSupply < parseEther("1")) { // If contract has very few tokens left
                    console.log("Contract token balance very low, stopping buys.");
                    break;
                }
            }
            console.log(`Finished attempt to sell up to 800M tokens. Actual sold: ${formatUnits(totalTokensSold,18)}`);
            expect(totalTokensSold).to.be.lte(INITIAL_SUPPLY_POOL); // Cannot sell more than total supply


            // Scenario 2c: After 800M tokens (approx), using the reserved 200M supply
            console.log("\n--- Scenario 2c: Selling remaining tokens from reserved supply (up to 1B total) ---");
            // Reserved supply should already be active.
            expect(await pool.isReservedSupplyActive()).to.be.true;
            
            totalTokensSold = await pool.totalTokensSoldFromCurve(); // Update current total sold
            let buysForNext200M = 0;
            const targetSoldTotal1B = INITIAL_SUPPLY_POOL;

            while(totalTokensSold < targetSoldTotal1B && buysForNext200M < 200) { // Safety break
                let buyEthAmount = parseEther("10"); // Continue with 10 ETH buys

                if (buyEthAmount < minBuy) buyEthAmount = minBuy;

                const buyer = (buysForNext200M % 2 === 0) ? buyer1 : buyer2;
                
                const contractTokens = await pool.balanceOf(pool.target);
                if (contractTokens === 0n){
                    console.log("Contract is out of tokens. Stopping simulation.");
                    break;
                }
                 // If calculated tokens to buy is more than available, it should cap or revert.
                // The buy() function has `require(tokensToTransfer <= tokensRemainingInContractForSale)`

                try {
                    const tx = await pool.connect(buyer).buy({value: buyEthAmount});
                    await tx.wait();
                    totalTokensSold = await pool.totalTokensSoldFromCurve();
                    buysForNext200M++;
                     if (buysForNext200M % 5 === 0 || totalTokensSold >= targetSoldTotal1B) {
                        await logPoolState(pool, buyer, `Sim2c Buy #${buysForNext200M}, Total Sold: ${formatUnits(totalTokensSold, 18)}`);
                    }
                } catch (e) {
                    console.error("Error during buy in Sim2c:", e.message);
                     if (e.message.includes("Purchase exceeds total available supply for curve") || 
                         e.message.includes("Not enough tokens in contract balance") ||
                         e.message.includes("Would receive zero tokens")) {
                         console.log("Reached supply limit or price is too high to get tokens.");
                         break;
                    }
                    // If it's another error, let it fail the test
                    throw e;
                }

                if ((await pool.balanceOf(pool.target)) === 0n) {
                     console.log("All tokens from contract sold out.");
                     break;
                }
            }
            totalTokensSold = await pool.totalTokensSoldFromCurve(); // final check
            console.log(`Finished attempt to sell all 1B tokens. Actual total sold: ${formatUnits(totalTokensSold,18)}`);
            await logPoolState(pool, buyer2, "Sim2/3 End - After attempting to sell all tokens");

            expect(totalTokensSold).to.be.lte(INITIAL_SUPPLY_POOL);
            if (totalTokensSold === INITIAL_SUPPLY_POOL) {
                console.log("Successfully sold all 1 Billion tokens!");
                expect(await pool.balanceOf(pool.target)).to.equal(0n);
            } else {
                console.warn(`Could not sell all tokens. Sold: ${formatUnits(totalTokensSold,18)} / ${formatUnits(INITIAL_SUPPLY_POOL,18)}`);
            }

            // Try to buy more after all tokens are supposedly sold
            if (totalTokensSold >= INITIAL_SUPPLY_POOL - parseEther("1")) { // If very close to or at total supply
                 await expect(pool.connect(buyer1).buy({value: minBuy}))
                    .to.be.reverted; // Should revert, likely with "Purchase exceeds total available supply for curve" or "Would receive zero tokens"
                console.log("Attempt to buy after all tokens sold reverted as expected.");
            }

            // Test selling back some tokens after full/near depletion
            const buyer1Balance = await pool.balanceOf(buyer1.address);
            if (buyer1Balance > 0n) {
                console.log(`Buyer1 has ${formatUnits(buyer1Balance,18)} tokens. Attempting to sell half.`);
                const sellAmount = buyer1Balance / 2n;
                if (sellAmount > 0n) {
                    await pool.connect(buyer1).sell(sellAmount);
                    await logPoolState(pool, buyer1, `After Buyer1 sold back ${formatUnits(sellAmount,18)} tokens`);
                    expect(await pool.balanceOf(pool.target)).to.be.gt(0n); // Contract should have tokens again
                }
            }
        });
    });
});
