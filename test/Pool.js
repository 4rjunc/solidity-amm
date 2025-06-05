const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseEther = ethers.parseEther;

describe("Launchpad and Pool Tests", function () {
  this.timeout(60000); // 1 minute timeout for the whole suite
  let TokenLaunchpad, launchpad, BondingCurvePool, pool, owner, addr1;
  const tokenName = "My Test Token";
  const tokenSymbol = "MTT";
  const initialLotteryPool = parseEther("1.0");

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy Launchpad
    TokenLaunchpad = await ethers.getContractFactory("TokenLaunchpad");
    launchpad = await TokenLaunchpad.deploy(owner.address);
    await launchpad.waitForDeployment();

    // Deploy Pool via Launchpad by owner
    await launchpad.connect(owner).launchToken(tokenName, tokenSymbol, initialLotteryPool);
    const tokens = await launchpad.getAllTokens();
    const poolAddress = tokens[0].tokenAddress;

    BondingCurvePool = await ethers.getContractFactory("BondingCurvePool");
    pool = BondingCurvePool.attach(poolAddress);
  });

  describe("TokenLaunchpad", function () {
    it("Should set the right owner", async function () {
      expect(await launchpad.owner()).to.equal(owner.address);
    });

    it("Should allow owner to launch a token and emit event", async function () {
        const anotherName = "Another Token";
        const anotherSymbol = "ANT";
        const anotherLottery = parseEther("2.0");

        await expect(launchpad.connect(owner).launchToken(anotherName, anotherSymbol, anotherLottery))
            .to.emit(launchpad, "TokenCreated")
            .withArgs(ethers.isAddress, anotherName, anotherSymbol);

        const tokens = await launchpad.getAllTokens();
        expect(tokens.length).to.equal(2);
        expect(tokens[1].name).to.equal(anotherName);
    });

    it("Should not allow non-owner to launch a token", async function () {
      await expect(
        launchpad.connect(addr1).launchToken("Nopety", "NOP", parseEther("1"))
      ).to.be.revertedWithCustomError(launchpad, "OwnableUnauthorizedAccount");
    });
  });

  describe("BondingCurvePool", function () {
    it("Should be initialized with correct parameters", async function () {
      expect(await pool.name()).to.equal(tokenName);
      expect(await pool.symbol()).to.equal(tokenSymbol);
      expect(await pool.lotteryPool()).to.equal(initialLotteryPool);
      
      const INITIAL_SUPPLY = 1_000_000_000n * 10n**18n;
      expect(await pool.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await pool.balanceOf(pool.target)).to.equal(INITIAL_SUPPLY);
    });

    it("Should allow a user to buy tokens", async function () {
      const buyer = addr1;
      const buyAmount = parseEther("0.1");
      const initialPoolEthBalance = await ethers.provider.getBalance(pool.target);
      const initialBuyerTokens = await pool.balanceOf(buyer.address);

      expect(initialBuyerTokens).to.equal(0n);
      
      await pool.connect(buyer).buy({ value: buyAmount });

      const finalPoolEthBalance = await ethers.provider.getBalance(pool.target);
      const finalBuyerTokens = await pool.balanceOf(buyer.address);
      
      expect(finalPoolEthBalance).to.be.gt(initialPoolEthBalance);
      expect(finalBuyerTokens).to.be.gt(0n);
    });

    it("Should allow a user to sell tokens they own", async function () {
        const user = addr1;
        const buyAmount = parseEther("0.5");
        await pool.connect(user).buy({ value: buyAmount });
        
        const tokensToSell = await pool.balanceOf(user.address);
        expect(tokensToSell).to.be.gt(0n);

        const ethBalanceBeforeSell = await ethers.provider.getBalance(user.address);
        
        await pool.connect(user).sell(tokensToSell);

        const finalTokenBalance = await pool.balanceOf(user.address);
        const ethBalanceAfterSell = await ethers.provider.getBalance(user.address);

        expect(finalTokenBalance).to.equal(0n);
        expect(ethBalanceAfterSell).to.be.gt(ethBalanceBeforeSell);
    });

    it("Should revert if trying to sell more tokens than owned", async function () {
        await expect(pool.connect(addr1).sell(parseEther("1"))).to.be.revertedWith("Not enough tokens to sell");
    });
    
    it("Should revert on buy with amount less than MIN_BUY", async function () {
        // MIN_BUY is 0.001 ETH
        await expect(pool.connect(addr1).buy({value: parseEther("0.0001")})).to.be.revertedWith("Below minimum buy amount");
    });

    it("Should activate reserved supply when lottery pool target is met", async function () {
        expect(await pool.isReservedSupplyActive()).to.be.false;

        // Lottery target is 1 ETH. Tax is 30%. Required buy is > 1/0.3 = 3.33... ETH
        const requiredBuyGross = parseEther("3.4");
        await pool.connect(addr1).buy({ value: requiredBuyGross });

        expect(await pool.isReservedSupplyActive()).to.be.true;
        expect(await pool.isLotteryTaxActive()).to.be.false;
    });
  });
});
