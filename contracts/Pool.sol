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
   uint256 tokensToMint = calculateBuyReturn();
   totalSupply = totalSupply.add(tokensToMint);
  }

  function calculateBuyReturn() public view return(uint256) {}
}
