// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";

contract Pool {
  using Math for uint256;
  using Math for uint32;

  mapping(address => uint256) public balances; // Should not be public, kept it public for testing
  uint256 totalSupply;
  uint32 slope;

  constructor(uint256 initialSupply, uint32 _slope){
      totalSupply = initialSupply;
      slope = _slope;
  }

  function sell(uint256 tokens) public {
    totalSupply = totalSupply - tokens;
    uint256 currentBalance = balances[msg.sender];
    balances[msg.sender] = currentBalance - tokens;
    
    uint256 ethReturn = calculateSellReturn(tokens);
    
    payable(msg.sender).transfer(ethReturn);
  }

  function buy() public payable  {
   require(msg.value > 0, "Sent some ETH");

   // calculate how number token can be brought by X amount of eth
   uint256 tokensToMint = calculateBuyReturn(msg.value); 
   //bool success;
   //totalSupply += tokensToMint; // unable to use .add() from SafeMath
   //(success, totalSupply) = totalSupply.tryAdd(tokensToMint);
   totalSupply += tokensToMint;
   uint256 currentBalance = balances[msg.sender];
   balances[msg.sender] = currentBalance + tokensToMint;
  }

  function calculateSellReturn(uint256 tokens) public view returns (uint256){
    uint256 currentPrice = calculateTokenPrice();
    return  tokens / currentPrice;
  }

  function calculateBuyReturn(uint256 depositAmount) public view returns(uint256) {
    uint256 currentPrice = calculateTokenPrice();
    return (depositAmount * 1e18) / currentPrice;
  }

  function calculateTokenPrice() public view returns(uint256) {
    uint256 temp = totalSupply * totalSupply;
    //bool success;
    //(success, temp) = totalSupply.tryMul(totalSupply);
    // In demo it was return slope.mul(trmp); 
    // find the differene between the arithmetic operations like *, .tryMul() and .mul()
    return  slope * temp;
  }
}
