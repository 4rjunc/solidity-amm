// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";

contract Pool {
  using Math for uint256;
  using Math for uint32;

  mapping(address => uint256) public balances;
  uint256 totalSupply;
  uint32 slope;

  constructor(uint256 initialSupply, uint32 _slope){
      totalSupply = initialSupply;
      slope = _slope;
  }

  function buy() public payable  {
   require(msg.value > 0, "Sent some ETH");
   uint256 tokensToMint = calculateBuyReturn();
    bool success;
   //totalSupply += tokensToMint; // unable to use .add() from SafeMath
   (success, totalSupply) = totalSupply.tryAdd(tokensToMint);
   balances[msg.sender] = tokensToMint;
  }

  function calculateBuyReturn() public view returns(uint256) {

  }

  function calculateTokenPrice() public view returns(uint256) {
    uint256 temp;
    bool success;
    (success, temp) = totalSupply.tryMul(totalSupply);
    return  slope * temp;
  }
}
