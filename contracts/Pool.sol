// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract BondingCurvePool is ERC20 {
    using Math for uint256;

    // Constants
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens with 18 decimals
    uint256 public constant MIN_LOTTERY_POOL = 1 ether; // 1 ETH minimum
    uint256 public constant MAX_LOTTERY_POOL = 10_000 ether; // 10,000 ETH maximum
    uint256 public constant MIN_BUY = 0.01 ether; // Minimum purchase
    uint256 public constant SCALE_FACTOR = 96; // 0.96 scaling factor (96/100)
    uint256 public constant SCALE_DENOMINATOR = 100;

    // State variables
    uint256 public initialTokenPrice;
    uint256 public lotteryPool;
    uint256 public ethRaised;
    uint256 public constant_k; // The K in the constant product formula
    uint256 public migrated_supply;    

    // Virtual reserves (calculated values)
    uint256 public virtualTokenReserve;
    uint256 public virtualEthReserve;

    event TokensPurchased(address indexed buyer, uint256 amountEth, uint256 amountTokens);
    event TokensSold(address indexed seller, uint256 amountTokens, uint256 amountEth);
    event LotteryPoolUpdated(uint256 newLotteryPool);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _initialTokenPrice,
        uint256 _initialLotteryPool,
        address _treasury
    ) ERC20(name, symbol) {

        require(_initialTokenPrice > 0, "Initial price must be greater than 0");
        require(_initialLotteryPool >= MIN_LOTTERY_POOL, "Lottery pool too small");
        require(_initialLotteryPool <= MAX_LOTTERY_POOL, "Lottery pool too large");
        
        initialTokenPrice = _initialTokenPrice;
        lotteryPool = _initialLotteryPool;

        // Mint token
        _mint(address(this), INITIAL_SUPPLY);

        // Set the migrated supply (tokens not in the contract)
        migrated_supply = INITIAL_SUPPLY - balanceOf(address(this));

        // OPTIONAL: token transfer to treasury for team/marketing etc 
        //uint256 treasuryAmount = INITIAL_SUPPLY * 20/100;
        //_transfer(address(this), treasury, treasuryAmount);

        // Initialize virtual reserves
        updateVirtualReserves();
    }


    // virtual reserves based on lottery pool
    function updateVirtualReserves() public {
        // Virtual token reserve = -2L / (P₀ - L/S_migrated)
        uint256 denominator = initialTokenPrice - (lotteryPool * 1e18 / migrated_supply);

        // To avoid dealing with negative numbers in Solidity, we rearrange the formula
        virtualTokenReserve = (2 * lotteryPool * 1e18) / denominator;
        
        // Virtual ETH reserve = P₀ * V_TOKENS
        virtualEthReserve = (initialTokenPrice * virtualTokenReserve) / 1e18;
        
        // Update constant k = V_ETH * V_TOKENS
        constant_k = (virtualEthReserve * virtualTokenReserve) / 1e18;
    }

    // current token price based on virtual reserves
    function calculateCurrentPrice() public view returns (uint256) {
        return (virtualEthReserve * 1e18) / virtualTokenReserve;
    }

    // Calculate how many tokens will be minted for a given ETH amount
    function calculateBuyReturn(uint256 ethAmount) public view returns (uint256) {
        uint256 poolTokenBalance = balanceOf(address(this));
        uint256 circulatingSupply = INITIAL_SUPPLY - poolTokenBalance;

        if (circulatingSupply == 0 || reserveBalance == 0) { // the token transfered to treasury not consider
            return ethAmount * 1e18 / initialTokenPrice; // Initial exchange rate
        }

        // Formula: supply * ((1 + deposit/reserve)^(reserveRatio/100) - 1)
        // We simplify for small purchases: tokens = deposit * supply / (reserve * reserveRatio/100)
        return (ethAmount * circulatingSupply) / (reserveBalance * reserveRatio / 100);
    }

    // Calculate how much ETH will be returned for a given token amount
    function calculateSellReturn(uint256 tokenAmount) public view returns (uint256) {
        uint256 poolTokenBalance = balanceOf(address(this));
        uint256 circulatingSupply = INITIAL_SUPPLY - poolTokenBalance;

        require(totalSupply() > 0, "No tokens in circulation");
        require(tokenAmount <= totalSupply(), "Not enough tokens in circulation");
        require(reserveBalance > 0, "No ETH in reserve");
        
        // Formula: reserve * (1 - (1 - tokenAmount/supply)^(100/reserveRatio))
        // We simplify for small sales: eth = tokens * reserve * reserveRatio/100 / supply
        return (tokenAmount * reserveBalance * reserveRatio / 100) / circulatingSupply;
    }

    // Buy tokens with ETH
    function buy() public payable {
        require(msg.value > 0, "Must send ETH to buy tokens");
        
        uint256 tokensToTransfer = calculateBuyReturn(msg.value);
        require(tokensToTransfer > 0, "Not enough ETH sent");
        require(tokensToTransfer <= balanceOf(address(this)), "Not enough tokens in the pool");
        
        reserveBalance += msg.value;
        _transfer(address(this), msg.sender, tokensToTransfer);
        
        emit TokensPurchased(msg.sender, msg.value, tokensToTransfer); // my assumption is to print circulatingSupply, poolTokenBalance to get the market cap
    }

    // Sell tokens to get ETH back
    function sell(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must sell more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");   

        uint256 ethToReturn = calculateSellReturn(tokenAmount);
        require(ethToReturn > 0, "Not enough tokens to receive ETH");
        require(ethToReturn <= address(this).balance, "Contract has insufficient ETH");
        
        _transfer(msg.sender, address(this), tokenAmount);
        reserveBalance -= ethToReturn;
        payable(msg.sender).transfer(ethToReturn);
        
        emit TokensSold(msg.sender, tokenAmount, ethToReturn); // my assumption is to print circulatingSupply, poolTokenBalance to get the market cap
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

    // Fund the contract with initial ETH without buying tokens
    function addLiquidity() external payable {
        reserveBalance += msg.value;
    }
}
