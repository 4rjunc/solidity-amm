// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./Pool.sol";

contract TokenLaunchpad is Ownable {

    event TokenCreated(
        address indexed tokenAddress, 
        string name, 
        string symbol
    );

    // Struct to store token details
    struct TokenInfo {
        address tokenAddress;
        string name;
        string symbol;
    }

    TokenInfo[] public createdTokens;

    constructor(address initialOwner) Ownable(initialOwner){}

    // Function to create a new ERC20 token
    function launchToken(
        string memory name,
        string memory symbol,
        uint256 initialTokenPrice,
        uint256 initialLotteryPool
     ) public onlyOwner returns (address) {

       //change to initialOwer or a multisig wallet
       BondingCurvePool  newToken = new BondingCurvePool(name, symbol, initialTokenPrice, initialLotteryPool, address(this));

       TokenInfo memory tokenInfo = TokenInfo({
         tokenAddress: address(newToken),
         name: name,
         symbol: symbol
       });
       createdTokens.push(tokenInfo);
        
        // Emit event about token creation
        emit TokenCreated(address(newToken), name, symbol);

        return address(newToken);
    }

    // Function to retrieve all created tokens
    function getAllTokens() public view returns (TokenInfo[] memory) {
        return createdTokens;
    }
}

