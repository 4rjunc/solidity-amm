const { ethers } = require("hardhat");

describe("Pool", () => {
  it("should work", async () => {

    const [owner, otherAccount] = await ethers.getSigners();
    const Pool = await ethers.getContractFactory("Pool");

    const initialSupply = 100;
    const slope = 1;
    const pool = await Pool.deploy(initialSupply, slope);
  })
})
