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

    // TODO: try after removing memory keyword
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
        
        // Mint initial tokens to the contract
        _mint(address(this), INITIAL_SUPPLY);
        
        // Optional: Set aside tokens for team/treasury
       // uint256 treasuryAmount = INITIAL_SUPPLY * 20/100; // 20% for team/treasury (200M tokens)

        uint256 treasuryAmount = INITIAL_SUPPLY * 20/100; // 20% for team/treasury (200M tokens)
        _transfer(address(this), _treasury, treasuryAmount);
        
        // Set the migrated supply (tokens not in the contract)
        migrated_supply = treasuryAmount; // 200M tokens (20% of total)
        
        // Initialize virtual reserves
        updateVirtualReserves();
    }
    
    // Calculate virtual reserves based on lottery pool
    function updateVirtualReserves() public {
        // Virtual token reserve = -2L / (P₀ - L/S_migrated)
        require(migrated_supply > 0, "Migrated supply must be greater than 0");
        require(initialTokenPrice > 0, "Initial price must be greater than 0");
        
        // Calculate L/S_migrated
        uint256 lotteryPerSupply = (lotteryPool * 1e18) / migrated_supply;
        
        // Calculate denominator (P₀ - L/S_migrated)
        require(initialTokenPrice > lotteryPerSupply, "Initial price must be greater than L/S_migrated");
        uint256 denominator = initialTokenPrice - lotteryPerSupply;
        
        // Calculate virtual token reserve = -2L / (P₀ - L/S_migrated)
        // Since we can't have negative numbers in Solidity, we'll work with the absolute value
        uint256 newVirtualTokenReserve = (2 * lotteryPool * 1e18) / denominator;
        
        if (constant_k == 0) {
            // First time initialization
            virtualTokenReserve = newVirtualTokenReserve;
            virtualEthReserve = (initialTokenPrice * virtualTokenReserve) / 1e18;
            constant_k = (virtualEthReserve * virtualTokenReserve) / 1e18;
        } else {
            // For subsequent updates, maintain constant K by adjusting ETH reserve
            virtualTokenReserve = newVirtualTokenReserve;
            virtualEthReserve = (constant_k * 1e18) / virtualTokenReserve;
        }
    }
    
    // Calculate current token price based on virtual reserves
    function calculateCurrentPrice() public view returns (uint256) {
        return (virtualEthReserve * 1e18) / virtualTokenReserve;
    }

    // Calculate how many tokens will be received for a given ETH amount
    function calculateBuyReturn(uint256 ethAmount) public view returns (uint256) {        
        // Apply the bonding curve formula: ΔS = V_TOKENS - K/(V_ETH + 0.96x)
        uint256 scaledEthAmount = (ethAmount * SCALE_FACTOR) / SCALE_DENOMINATOR;
        uint256 newVirtualEthReserve = virtualEthReserve + scaledEthAmount;
        
        // Calculate new virtual token reserve using K = V_ETH * V_TOKENS
        uint256 newVirtualTokenReserve = (constant_k * 1e18) / newVirtualEthReserve;
        
        // Tokens to transfer = change in virtual token reserve
        require(virtualTokenReserve > newVirtualTokenReserve, "Invalid state: token reserve would increase");
        uint256 tokensToTransfer = virtualTokenReserve - newVirtualTokenReserve;
        
        return tokensToTransfer;
    }

    // Calculate how much ETH will be returned for a given token amount
    function calculateSellReturn(uint256 tokenAmount) public view returns (uint256) {
        // Apply the bonding curve formula: ΔE = V_ETH - K/(V_TOKENS + 0.96y)
        uint256 scaledTokenAmount = (tokenAmount * SCALE_FACTOR) / SCALE_DENOMINATOR;
        uint256 newVirtualTokenReserve = virtualTokenReserve + scaledTokenAmount;
        
        // Calculate new virtual ETH reserve using K = V_ETH * V_TOKENS
        uint256 newVirtualEthReserve = (constant_k * 1e18) / newVirtualTokenReserve;
        
        // ETH to return = change in virtual ETH reserve
        require(virtualEthReserve > newVirtualEthReserve, "Invalid state: ETH reserve would increase");
        uint256 ethToReturn = virtualEthReserve - newVirtualEthReserve;
        
        return ethToReturn;
    }

    // Buy tokens with ETH
    function buy() public payable {
        require(msg.value >= MIN_BUY, "Below minimum buy amount");
        
        // Check against maximum buy limit
        // What This Means
        // Your contract is implementing a liquidity protection mechanism that prevents any single buyer 
        // from consuming too much of the remaining pool in one transaction. This is a common practice to:
        // 1. Prevent price manipulation by large buyers
        // 2. Ensure fair distribution of tokens among many participants
        // 3. Reduce the impact of "whales" on the token price
        uint256 maxBuy = (lotteryPool - ethRaised) * 10 / 100; // 10% of remaining pool
        require(msg.value <= maxBuy, "Exceeds maximum buy amount");
        
        uint256 tokensToTransfer = calculateBuyReturn(msg.value);
        require(tokensToTransfer > 0, "Would receive zero tokens");
        require(tokensToTransfer <= balanceOf(address(this)), "Not enough tokens in the pool");
        
        // Update state
        ethRaised += msg.value;
        
        // Update virtual reserves for the buy operation
        uint256 scaledEthAmount = (msg.value * SCALE_FACTOR) / SCALE_DENOMINATOR;
        virtualEthReserve += scaledEthAmount;
        virtualTokenReserve = (constant_k * 1e18) / virtualEthReserve;
        
        // Transfer tokens to buyer
        _transfer(address(this), msg.sender, tokensToTransfer);
        
        emit TokensPurchased(msg.sender, msg.value, tokensToTransfer);
    }

    // Sell tokens to get ETH back
    function sell(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must sell more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");   

        uint256 ethToReturn = calculateSellReturn(tokenAmount);
        require(ethToReturn > 0, "Would receive zero ETH");
        require(ethToReturn <= address(this).balance, "Contract has insufficient ETH");
        
        // Update state
        _transfer(msg.sender, address(this), tokenAmount);
        
        // Update virtual reserves for the sell operation
        uint256 scaledTokenAmount = (tokenAmount * SCALE_FACTOR) / SCALE_DENOMINATOR;
        virtualTokenReserve += scaledTokenAmount;
        virtualEthReserve = (constant_k * 1e18) / virtualTokenReserve;
        
        // Transfer ETH to seller
        payable(msg.sender).transfer(ethToReturn);
        
        emit TokensSold(msg.sender, tokenAmount, ethToReturn);
    }
    
    // Function to burn tokens (reduces supply without affecting curve math)
    function burn(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must burn more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to burn");
        
        _burn(msg.sender, tokenAmount);
    }
    
    // Fallback function to handle ETH transfers
    receive() external payable {
        // Auto-buy tokens when ETH is sent to the contract
        if (msg.sender != address(0)) {
            buy();
        } else {
            // Direct transfers increase the lottery pool
            lotteryPool += msg.value;
            updateVirtualReserves();
            emit LotteryPoolUpdated(lotteryPool);
        }
    }

    // Fund the lottery pool with ETH
    function addToLotteryPool() external payable {
        require(lotteryPool + msg.value <= MAX_LOTTERY_POOL, "Would exceed maximum lottery pool");
        
        lotteryPool += msg.value;
        updateVirtualReserves();
        
        emit LotteryPoolUpdated(lotteryPool);
    }
}
