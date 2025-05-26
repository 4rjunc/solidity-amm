// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// import "./RandomWalletPicker.sol";

contract BondingCurvePool is ERC20 {
    using Math for uint256;

    // Constants
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens with 18 decimals
    uint256 public constant MIN_LOTTERY_POOL = 0.1 ether; // 0.1 ETH minimum
    uint256 public constant MAX_LOTTERY_POOL = 10_000 ether; // 10,000 ETH maximum
    uint256 public constant MIN_BUY = 0.001 ether; // Minimum purchase

    // State variables
    uint256 public initialTokenPrice; // Price in ETH wei per token unit (scaled by 1e18 if representing fraction)
    uint256 public lotteryPool; // Target ETH to be raised by the curve
    uint256 public ethRaised;
    uint256 public constant_k; // The K in the constant product formula (xy=k), scaled
    
    // Virtual reserves (calculated values)
    uint256 public virtualTokenReserve; // Tokens with 18 decimals
    uint256 public virtualEthReserve; // ETH in wei
    
    event TokensPurchased(address indexed buyer, uint256 amountEth, uint256 amountTokens);
    event TokensSold(address indexed seller, uint256 amountTokens, uint256 amountEth);
    event LotteryPoolUpdated(uint256 newLotteryPool);

    // TODO: try after removing memory keyword
    constructor(
        string memory name,
        string memory symbol,
        uint256 _initialLotteryPool, // Initial ETH amount to target for the lottery pool
        address _treasury
    ) ERC20(name, symbol) {
        require(_initialLotteryPool >= MIN_LOTTERY_POOL, "Lottery pool too small");
        require(_initialLotteryPool <= MAX_LOTTERY_POOL, "Lottery pool too large");

        lotteryPool = _initialLotteryPool;
        
        // Calculate initial token price: LP reqd / 1B tokens
        // (ETH_wei * 1e18) / (Num_Tokens_with_18_decimals) -> gives price per base token unit, scaled by 1e18
        // Or, if initialTokenPrice is ETH_wei per token_with_18_decimals, then (ETH_wei) / (Num_Tokens_without_18_decimals_in_unit)
        //(lotteryPool_wei * 1e18) / INITIAL_SUPPLY_tokens_with_18_decimals
        initialTokenPrice = (lotteryPool * 1e18) / INITIAL_SUPPLY;
        require(initialTokenPrice > 0, "Initial price must be > 0 (check lottery pool size)");
        
        // Mint initial tokens to the contract
        _mint(address(this), INITIAL_SUPPLY);
        
        // Set aside 20% tokens for team/treasury
        uint256 treasuryAmount = INITIAL_SUPPLY * 20 / 100; // 200M tokens
        _transfer(address(this), _treasury, treasuryAmount);
        
        // Initialize virtual reserves based on the new logic
        updateVirtualReserves();
    }
    
    // Calculate/Update virtual reserves based on current lotteryPool and fixed initialTokenPrice
    function updateVirtualReserves() public {
        uint256 tokensForBondingCurve = INITIAL_SUPPLY * 80 / 100; // 800M tokens (with 18 decimals)

        // term_tokens_mul_price = tokensForBondingCurve * initialTokenPrice (result in ETH wei)
        // (tokens_with_18dec * (price_wei_per_token_scaled_by_1e18)) / 1e18
        uint256 term_tokens_mul_price = (tokensForBondingCurve * initialTokenPrice) / 1e18;

        require(lotteryPool > 0, "Lottery pool must be positive for reserve calculation");

        if (lotteryPool <= term_tokens_mul_price) {
            // Adjust as per logic if initial price is too high relative to lottery pool
            // v_tokens = initial_supply_total * 10
            virtualTokenReserve = INITIAL_SUPPLY * 10;
            // v_eth = initial_price * v_tokens
            virtualEthReserve = (virtualTokenReserve * initialTokenPrice) / 1e18;
        } else {
            uint256 denominator = lotteryPool - term_tokens_mul_price; // Denominator in ETH wei
            require(denominator > 0, "Denominator must be positive"); 
            // v_tokens = tokens_for_bonding_curve * lottery_pool / denominator
            // (tokens_with_18dec * lotteryPool_wei) / denominator_wei => result in tokens_with_18dec
            virtualTokenReserve = (tokensForBondingCurve * lotteryPool) / denominator;
            
            // v_eth = initial_price * v_tokens
            virtualEthReserve = (virtualTokenReserve * initialTokenPrice) / 1e18;
        }

        // Python: if self.v_tokens < initial_supply (where initial_supply means total initial supply)
        if (virtualTokenReserve < INITIAL_SUPPLY) {
            virtualTokenReserve = INITIAL_SUPPLY * 2;
            virtualEthReserve = (virtualTokenReserve * initialTokenPrice) / 1e18;
        }
        
        // constant_k = virtualTokenReserve * virtualEthReserve (scaled)
        // (tokens_with_18dec * eth_wei) / 1e18 => k with 18 effective decimals relative to base units
        uint256 new_k = (virtualTokenReserve * virtualEthReserve) / 1e18;
        require(new_k > 0, "New K must be positive"); // Ensures reserves are non-zero
        require(virtualTokenReserve > 0, "Virtual token reserve must be positive"); // K > 0 implies this
        require(virtualEthReserve > 0, "Virtual ETH reserve must be positive"); // K > 0 implies this

        constant_k = new_k;
    }
    
    // Calculate current token price based on virtual reserves
    function calculateCurrentPrice() public view returns (uint256) {
        require(virtualTokenReserve > 0, "Virtual token reserve cannot be zero");
        // (eth_wei * 1e18) / tokens_with_18dec => price_wei_per_token_scaled_by_1e18
        return (virtualEthReserve * 1e18) / virtualTokenReserve;
    }

    // Calculate how many tokens will be received for a given ETH amount
    function calculateBuyReturn(uint256 ethAmount) public view returns (uint256) {
        require(ethAmount > 0, "ETH amount must be positive");
        uint256 newVirtualEthReserve = virtualEthReserve + ethAmount;
        // Ensure newVirtualEthReserve does not overflow and is positive
        require(newVirtualEthReserve > virtualEthReserve, "ETH amount causes overflow or is zero");
        require(newVirtualEthReserve > 0, "New virtual ETH reserve must be positive");

        // newVirtualTokenReserve = (constant_k_scaled * 1e18) / newVirtualEthReserve_wei
        // => tokens_with_18dec
        uint256 newVirtualTokenReserve = (constant_k * 1e18) / newVirtualEthReserve;
        
        require(virtualTokenReserve > newVirtualTokenReserve, "Invalid state: token reserve would not decrease on buy");
        uint256 tokensToTransfer = virtualTokenReserve - newVirtualTokenReserve;
        
        return tokensToTransfer;
    }

    // Calculate how much ETH will be returned for a given token amount
    function calculateSellReturn(uint256 tokenAmount) public view returns (uint256) {
        require(tokenAmount > 0, "Token amount must be positive");
        uint256 newVirtualTokenReserve = virtualTokenReserve + tokenAmount;
        // Ensure newVirtualTokenReserve does not overflow and is positive
        require(newVirtualTokenReserve > virtualTokenReserve, "Token amount causes overflow or is zero");
        require(newVirtualTokenReserve > 0, "New virtual token reserve must be positive");

        // newVirtualEthReserve = (constant_k_scaled * 1e18) / newVirtualTokenReserve_with_18dec
        // => eth_wei
        uint256 newVirtualEthReserve = (constant_k * 1e18) / newVirtualTokenReserve;
        
        require(virtualEthReserve > newVirtualEthReserve, "Invalid state: ETH reserve would not decrease on sell");
        uint256 ethToReturn = virtualEthReserve - newVirtualEthReserve;
        
        return ethToReturn;
    }

    // Buy tokens with ETH
    function buy() public payable {
        require(msg.value >= MIN_BUY, "Below minimum buy amount");
        
        uint256 remainingPoolCapacity = (lotteryPool > ethRaised) ? lotteryPool - ethRaised : 0;
        uint256 maxBuy = remainingPoolCapacity * 10 / 100; // 10% of remaining capacity to reach lotteryPool target
        if (remainingPoolCapacity == 0) { // If lottery pool target met or exceeded
             maxBuy = (address(this).balance - msg.value) * 10 / 100; // Fallback: 10% of available contract ETH excluding current buy
        }
        require(msg.value <= maxBuy, "Exceeds dynamic maximum buy amount");
        
        uint256 tokensToTransfer = calculateBuyReturn(msg.value);
        require(tokensToTransfer > 0, "Would receive zero tokens");
        
        uint256 contractTokenBalance = balanceOf(address(this));
        require(tokensToTransfer <= contractTokenBalance, "Not enough tokens in the pool");

        // Constraint: Ensure contract token balance does not drop below 20% of INITIAL_SUPPLY
        uint256 minContractTokens = INITIAL_SUPPLY * 20 / 100;
        require(contractTokenBalance - tokensToTransfer >= minContractTokens, "Buy breaches 20% token reserve");
        
        // Update state
        ethRaised += msg.value;
        
        // Update virtual reserves for the buy operation (No scaling factor)
        virtualEthReserve += msg.value;
        // Recalculate virtualTokenReserve to maintain K
        require(virtualEthReserve > 0, "Virtual ETH reserve became zero after buy update");
        virtualTokenReserve = (constant_k * 1e18) / virtualEthReserve; 
        
        // Transfer tokens to buyer
        _transfer(address(this), msg.sender, tokensToTransfer);

        // Call the VRF Function RandomWalletPicker
                
        emit TokensPurchased(msg.sender, msg.value, tokensToTransfer);
    }

    // Sell tokens to get ETH back
    function sell(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must sell more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");   

        uint256 ethToReturn = calculateSellReturn(tokenAmount);
        require(ethToReturn > 0, "Would receive zero ETH");
        require(ethToReturn <= address(this).balance, "Contract has insufficient ETH");
        
        // Update state (tokens first)
        _transfer(msg.sender, address(this), tokenAmount);
        
        // Update virtual reserves for the sell operation (No scaling factor)
        virtualTokenReserve += tokenAmount;
        // Recalculate virtualEthReserve to maintain K
        require(virtualTokenReserve > 0, "Virtual token reserve became zero after sell update");
        virtualEthReserve = (constant_k * 1e18) / virtualTokenReserve;
        
        // Transfer ETH to seller
        payable(msg.sender).transfer(ethToReturn);
        
        emit TokensSold(msg.sender, tokenAmount, ethToReturn);
    }
    
    // Function to burn tokens (reduces supply without affecting curve math directly on virtual reserves)
    function burn(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must burn more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to burn");
        
        _burn(msg.sender, tokenAmount);
        // Note: Burning tokens by users does not change virtual reserves or k directly.
        // It affects the total supply and user's balance.
    }
    
    // Fallback function to handle ETH transfers
    receive() external payable {
        // Auto-buy tokens when ETH is sent to the contract by an EOA/contract
        if (msg.sender != address(0)) { // Basic check, could be more robust (e.g. check if contract)
            // To prevent accidental buys with large ETH amounts without explicit buy call,
            // one might choose to revert or handle differently.
            // For now, let's assume direct ETH sends are intentional buys if MIN_BUY is met.
            if (msg.value >= MIN_BUY) {
                // Replicate buy() logic carefully, ensuring all checks are met
                // This is a simplified path; a dedicated internal _buy function might be better.
                // For simplicity here, we'll assume this path is less frequent or controlled.
                // Consider implications of maxBuy constraint here.
                // A simple buy forwarding could be:
                // this.buy{value: msg.value}(); //This would call the full buy function
                // However, direct call to buy() is not possible from receive() if buy() is not payable (it is).
                // Let's make it add to lottery pool instead, as this is safer and more aligned with one path of original logic.
                // Fallback: direct transfers increase the lottery pool
                if (lotteryPool + msg.value > MAX_LOTTERY_POOL) {
                    revert("Direct ETH transfer would exceed maximum lottery pool");
                }
                lotteryPool += msg.value;
                updateVirtualReserves(); // Recalculate curve parameters
                emit LotteryPoolUpdated(lotteryPool);

            } else {
                // If ETH sent is less than MIN_BUY, treat as donation to lottery pool
                // or revert. Adding to pool is one option.
                if (lotteryPool + msg.value > MAX_LOTTERY_POOL) {
                     revert("Direct ETH transfer would exceed maximum lottery pool");
                }
                lotteryPool += msg.value;
                updateVirtualReserves();
                emit LotteryPoolUpdated(lotteryPool);
            }
        }
        // ETH from address(0) (e.g. coinbase/block reward) is not expected here.
    }

    // Fund the lottery pool with ETH
    function addToLotteryPool() external payable {
        require(lotteryPool + msg.value <= MAX_LOTTERY_POOL, "Would exceed maximum lottery pool");
        
        lotteryPool += msg.value;
        updateVirtualReserves(); // Recalculate curve parameters with new total lotteryPool
        
        emit LotteryPoolUpdated(lotteryPool);
    }
}
