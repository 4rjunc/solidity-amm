// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract BondingCurvePool is ERC20 {
    using Math for uint256;

    uint256 public reserveBalance;
    uint256 public reserveRatio; 
    
    event TokensPurchased(address indexed buyer, uint256 amountEth, uint256 amountTokens);
    event TokensSold(address indexed seller, uint256 amountTokens, uint256 amountEth);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _reserveRatio
    ) ERC20(name, symbol) {
        require(_reserveRatio > 0 && _reserveRatio <= 100, "Reserve ratio must be between 1-100");
        reserveRatio = _reserveRatio;
    }

    function calculateCurrentPrice() public view returns (uint256) {
        if (totalSupply() == 0) {
            return 1e15; // Initial price of 0.001 ETH per token
        }
        
        return (reserveBalance * 1e18) / (totalSupply() * reserveRatio / 100);
    }

    // Calculate how many tokens will be minted for a given ETH amount
    function calculateBuyReturn(uint256 ethAmount) public view returns (uint256) {
        if (totalSupply() == 0) {
            return ethAmount * 1e3; // Initial exchange rate
        }

        uint256 currentSupply = totalSupply();
        uint256 currentReserve = reserveBalance;
        
        // Formula: supply * ((1 + deposit/reserve)^(reserveRatio/100) - 1)
        // We simplify for small purchases: tokens = deposit * supply / (reserve * reserveRatio/100)
        return (ethAmount * currentSupply) / (currentReserve * reserveRatio / 100);
    }

    // Calculate how much ETH will be returned for a given token amount
    function calculateSellReturn(uint256 tokenAmount) public view returns (uint256) {
        require(totalSupply() > 0, "No tokens in circulation");
        require(tokenAmount <= totalSupply(), "Not enough tokens in circulation");
        
        uint256 currentSupply = totalSupply();
        uint256 currentReserve = reserveBalance;
        
        // Formula: reserve * (1 - (1 - tokenAmount/supply)^(100/reserveRatio))
        // We simplify for small sales: eth = tokens * reserve * reserveRatio/100 / supply
        return (tokenAmount * currentReserve * reserveRatio / 100) / currentSupply;
    }

    // Buy tokens with ETH
    function buy() public payable {
        require(msg.value > 0, "Must send ETH to buy tokens");
        
        uint256 tokensToMint = calculateBuyReturn(msg.value);
        require(tokensToMint > 0, "Not enough ETH sent");
        
        reserveBalance += msg.value;
        _mint(msg.sender, tokensToMint);
        
        emit TokensPurchased(msg.sender, msg.value, tokensToMint);
    }

    // Sell tokens to get ETH back
    function sell(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must sell more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");
        
        uint256 ethToReturn = calculateSellReturn(tokenAmount);
        require(ethToReturn > 0, "Not enough tokens to receive ETH");
        require(ethToReturn <= address(this).balance, "Contract has insufficient ETH");
        
        _burn(msg.sender, tokenAmount);
        reserveBalance -= ethToReturn;
        payable(msg.sender).transfer(ethToReturn);
        
        emit TokensSold(msg.sender, tokenAmount, ethToReturn);
    }
    
    // Fallback function to handle ETH transfers
    receive() external payable {
        // Auto-buy tokens when ETH is sent to the contract
        if (msg.sender != address(0)) {
            buy();
        } else {
            reserveBalance += msg.value;
        }
    }
}
