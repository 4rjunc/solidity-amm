// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Pool is ERC20 {
  using Math for uint256;
  using Math for uint32;

  //mapping(address => uint256) public balances; // Should not be public, kept it public for testing
  //uint256 totalSupply;
  uint32 slope;

  constructor(uint256 initialSupply, uint32 _slope) ERC20("Gold", "GLD"){
      _mint(msg.sender, initialSupply);
      slope = _slope;
  }

  function sell(uint256 tokens) public {
    require(balanceOf(msg.sender) >= tokens);

    uint256 ethReturn = calculateSellReturn(tokens);
    require(ethReturn <= address(this).balance, "Contract is broke like you"); // Checks if the contract has enough ETH to sent back
    
    _burn(msg.sender, tokens); // _mint and _burn are just a mapping function to handle balance of tokens

    payable(msg.sender).transfer(ethReturn);
  }

  function buy() public payable  {
   require(msg.value > 0, "Sent some ETH");

   // calculate how number token can be brought by X amount of eth
   uint256 tokensToMint = calculateBuyReturn(msg.value); 
   _mint(msg.sender, tokensToMint);

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
    uint256 supply = totalSupply();
    uint256 temp = supply * supply;
    return  slope * temp;
  }
  
  receive() external payable{}
}
