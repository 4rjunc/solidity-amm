const { ethers } = require("hardhat");


describe("Pool", () => {
  it("should work", async () => {

    const [owner, otherAccount] = await ethers.getSigners();
    const Pool = await ethers.getContractFactory("Pool");


    const initialSupply = ethers.parseUnits("20", 8);
    const slope = 1;
    const pool = await Pool.deploy(initialSupply, slope);

    await owner.sendTransaction({
      to: pool.getAddress(),
      value: ethers.parseEther("1000.0")
    })

    const contractBalance = await ethers.provider.getBalance(pool.getAddress());
    console.log("contractBalance: ", ethers.formatEther(contractBalance), " ETH")

    const tokenPrice = await pool.calculateTokenPrice();
    console.log("Token Price Before Buy: ", ethers.formatEther(tokenPrice), " ETH per Token")


    console.log("\n-----BUYING------");
    //Buying
    await pool.buy({ value: ethers.parseEther("2.0") }); // buying for 2 ETH

    const newTokenPrice = await pool.calculateTokenPrice();
    console.log("Token Price After Buy: ", ethers.formatEther(newTokenPrice), " ETH per Token")

    const balance = await pool.balanceOf(owner.address);
    console.log("Balance After Buy: ", ethers.formatUnits(balance, 0), " tokens");


    const contractBalanceAfterBuy = await ethers.provider.getBalance(pool.getAddress());
    console.log("contractBalance After Buy: ", ethers.formatEther(contractBalanceAfterBuy), " ETH")

    console.log("\n-----SELLING------");
    //Selling
    await pool.sell(balance);
    const newTokenPriceAfterSell = await pool.calculateTokenPrice();
    console.log("Token Price After Sell: ", ethers.formatEther(newTokenPriceAfterSell), " ETH")

    const balanceAfterSell = await pool.balanceOf(owner.address);
    console.log("Balance After Sell: ", ethers.formatUnits(balanceAfterSell), " tokens")

  })
})  
