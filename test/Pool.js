const { ethers } = require("hardhat");


describe("Pool", () => {
  it("should work", async () => {

    const [owner, otherAccount] = await ethers.getSigners();
    const Pool = await ethers.getContractFactory("Pool");

    const initialSupply = ethers.parseUnits("20", 8);
    const slope = 1;
    const pool = await Pool.deploy(initialSupply, slope);

    const tokenPrice = await pool.calculateTokenPrice();
    console.log("Token Price Before Buy: ", tokenPrice);


    console.log("\n-----BUYING------");
    //Buying
    await pool.buy({ value: ethers.parseEther("2.0") }); // buying for 2 ETH

    const newTokenPrice = await pool.calculateTokenPrice();
    console.log("Token Price After Buy: ", newTokenPrice);

    const balance = await pool.balances(owner.address);
    console.log("Balance After Buy: ", balance);

    console.log("\n-----SELLING------");
    //Selling
    await pool.sell(balance);
    const newTokenPriceAfterSell = await pool.calculateTokenPrice();
    console.log("Token Price After Sell: ", newTokenPriceAfterSell);

    const balanceAfterSell = await pool.balances(owner.address);
    console.log("Balance After Sell: ", balanceAfterSell);

  })
})  
