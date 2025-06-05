// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// import "./RandomWalletPicker.sol";

contract BondingCurvePool is ERC20 {
    using Math for uint256;

    // Constants
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens with 18 decimals
    uint256 public constant MIN_LOTTERY_POOL = 0.01 ether; // 0.01 ETH minimum
    uint256 public constant MAX_LOTTERY_POOL = 100 ether; // 100 ETH maximum
    uint256 public constant MIN_BUY = 0.001 ether; // Minimum purchase
    
    uint256 public constant RESERVED_SUPPLY_PERCENTAGE = 20; // 20% of tokens reserved for later activation
    uint256 public constant MIN_VIRTUAL_TOKEN_HEURISTIC_MULTIPLIER = 10; // For heuristic v_tokens calculation
    uint256 public constant MIN_SAFE_VIRTUAL_TOKEN_MULTIPLIER = 2; // Minimum safe v_tokens multiple of initial supply
    uint256 private constant ONE_ETHER = 1e18; // For precision in calculations

    // Fee Structure Constants (Numerators and Denominators for percentage calculations)
    // TAX_CONSTANT for initial price: Liquidity Pool = Lottery Pool / TAX_CONSTANT (33.33% tax currently) (0.3333 implies multiplying by 3)
    uint256 private constant INITIAL_PRICE_LP_MULTIPLIER = 3; // Corresponds to 1 / 0.3333

    uint256 private constant LOTTERY_POOL_FEE_NUMERATOR = 30;
    uint256 private constant LOTTERY_POOL_FEE_DENOMINATOR = 100; // 30%

    uint256 private constant HOLDER_POOL_FEE_NUMERATOR = 111;
    uint256 private constant HOLDER_POOL_FEE_DENOMINATOR = 10000; // 1.11%

    uint256 private constant PROTOCOL_POOL_FEE_NUMERATOR = 111;
    uint256 private constant PROTOCOL_POOL_FEE_DENOMINATOR = 10000; // 1.11%

    uint256 private constant DEV_FEE_NUMERATOR = 111;
    uint256 private constant DEV_FEE_DENOMINATOR = 10000; // 1.11%

    // State variables
    uint256 public initialTokenPrice;
    uint256 public lotteryPool; // Target ETH to be collected
    uint256 public ethRaised; // Total ETH collected by the curve
    uint256 public constant_k; // The K in the constant product formula (v_tokens * v_eth)
    uint256 public reservedSupplyAmount; // Amount of tokens reserved for later phase
    uint256 public totalTokensSoldFromCurve; // Tracks tokens sold via buy()
    
    // Virtual reserves
    uint256 public virtualTokenReserve;
    uint256 public virtualEthReserve;
    
    // Accumulated Taxes/Fees
    uint256 public accumulatedLotteryTax;
    uint256 public accumulatedHolderTax;
    uint256 public accumulatedProtocolTax;
    uint256 public accumulatedDevTax;
    bool public isLotteryTaxActive = true;
    bool public isReservedSupplyActive = false; // Tracks if the reserved supply has been activated
        
    event TokensPurchased(address indexed buyer, uint256 grossEthAmount, uint256 netEthForCurve, uint256 tokensReceived, uint256 lotteryFeeApplied);
    event TokensSold(address indexed seller, uint256 amountTokens, uint256 amountEth);
    event LotteryPoolUpdated(uint256 newLotteryPool);
    event CurveParametersUpdated(uint256 virtualTokenRes, uint256 virtualEthRes, uint256 k);
    event CurveVerification(uint256 maxEthPossible, uint256 targetLotteryPool, bool canReachTarget);
    event CurveAdjusted(uint256 oldVTokens, uint256 newVTokens, uint256 oldVEth, uint256 newVEth);
    event LotteryTaxStatusChanged(bool isActive);
    event ReservedSupplyActivated(uint256 tokensAddedToCurve, uint256 newVirtualTokenReserve, uint256 currentVirtualEthReserve, uint256 newConstantK);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _initialLotteryPool
    ) ERC20(name, symbol) {
        require(_initialLotteryPool >= MIN_LOTTERY_POOL, "Lottery pool too small");
        require(_initialLotteryPool <= MAX_LOTTERY_POOL, "Lottery pool too large");

        lotteryPool = _initialLotteryPool;
        
        // initialTokenPrice = (Lottery Pool / TAX) / INITIAL_SUPPLY
        // LiquidityPoolAmount = _initialLotteryPool / 0.3333 = _initialLotteryPool * 3
        uint256 LiquidityPoolAmount = _initialLotteryPool * INITIAL_PRICE_LP_MULTIPLIER;
        initialTokenPrice = (LiquidityPoolAmount * ONE_ETHER) / INITIAL_SUPPLY;
        require(initialTokenPrice > 0, "Calculated initial price must be > 0");
        
        _mint(address(this), INITIAL_SUPPLY);
        
        reservedSupplyAmount = (INITIAL_SUPPLY * RESERVED_SUPPLY_PERCENTAGE) / 100;
        
        // Initialize bonding curve parameters for the first phase
        _initializeCurveFirstPhase();
    }
    
    // Initialize bonding curve parameters for the first phase (before reserved supply is activated)
     function _initializeCurveFirstPhase() internal {
        uint256 tokensAvailableForInitialCurve = INITIAL_SUPPLY - reservedSupplyAmount;
        require(tokensAvailableForInitialCurve > 0, "No tokens available for initial curve phase");

        // The bonding curve is now conceptually set up with a target ETH amount that is
        // lotteryPool / TAX_CONSTANT (i.e., lotteryPool * 3), which we used to derive initialTokenPrice.
        // Let's call this the "effectiveLiquidityTargetForCurveSetup".
        uint256 effectiveLiquidityTargetForCurveSetup = lotteryPool * INITIAL_PRICE_LP_MULTIPLIER;

        // v_tokens = (tokensAvailableForInitialCurve * effectiveLiquidityTargetForCurveSetup) / (effectiveLiquidityTargetForCurveSetup - tokensAvailableForInitialCurve * initialTokenPrice)
        // initialTokenPrice is P0, scaled by 1e18
        // effectiveLiquidityTargetForCurveSetup is L_eff, in wei

        uint256 term_tokens_mul_P0 = (tokensAvailableForInitialCurve * initialTokenPrice) / ONE_ETHER; // Result is in ETH-like units (wei)

        uint256 newVirtualTokenReserve;

        if (effectiveLiquidityTargetForCurveSetup > term_tokens_mul_P0) {
            uint256 denominator = effectiveLiquidityTargetForCurveSetup - term_tokens_mul_P0; 
            if (denominator == 0) { 
                 newVirtualTokenReserve = tokensAvailableForInitialCurve * MIN_VIRTUAL_TOKEN_HEURISTIC_MULTIPLIER; // Heuristic based on available tokens
            } else {
                newVirtualTokenReserve = (tokensAvailableForInitialCurve * effectiveLiquidityTargetForCurveSetup) / denominator; 
            }
        } else {
            newVirtualTokenReserve = tokensAvailableForInitialCurve * MIN_VIRTUAL_TOKEN_HEURISTIC_MULTIPLIER; // Heuristic
        }

        // Ensure virtual tokens are at least a multiple of the tokens they represent in this phase
        uint256 minSafeVTokensForPhase = tokensAvailableForInitialCurve * MIN_SAFE_VIRTUAL_TOKEN_MULTIPLIER;
        if (newVirtualTokenReserve < minSafeVTokensForPhase) {
            newVirtualTokenReserve = minSafeVTokensForPhase;
        }
        
        virtualTokenReserve = newVirtualTokenReserve;
        virtualEthReserve = (virtualTokenReserve * initialTokenPrice) / ONE_ETHER;
        constant_k = (virtualTokenReserve * virtualEthReserve) / ONE_ETHER;

        _simplifiedVerifyCurveParameters(tokensAvailableForInitialCurve, effectiveLiquidityTargetForCurveSetup);

        emit CurveParametersUpdated(virtualTokenReserve, virtualEthReserve, constant_k);
    }

    // Function to activate the reserved supply and add it to the curve
    function _activateReservedSupply() internal {
        require(!isReservedSupplyActive, "Reserved supply already active");
        require(reservedSupplyAmount > 0, "No reserved supply to activate");

        uint256 tokensToAdd = reservedSupplyAmount;
        
        virtualTokenReserve += tokensToAdd;
        // Recalculate k based on the new virtualTokenReserve and current virtualEthReserve.
        // This will adjust the price point.
        constant_k = (virtualTokenReserve * virtualEthReserve) / ONE_ETHER; 
        
        isReservedSupplyActive = true;
        emit ReservedSupplyActivated(tokensToAdd, virtualTokenReserve, virtualEthReserve, constant_k);
    }

    // Simplified verification function - adjustments for shortage are removed.
    function _simplifiedVerifyCurveParameters(uint256 _tokensAvailableForCurve, uint256 _effectiveLiquidityTarget) internal {
        uint256 sum_vTokens_tokensToSell = virtualTokenReserve + _tokensAvailableForCurve;
        if (sum_vTokens_tokensToSell == 0) {
            emit CurveVerification(0, _effectiveLiquidityTarget, false);
            return;
        }

        uint256 k_div_sum = (constant_k * ONE_ETHER) / sum_vTokens_tokensToSell;

        uint256 maxEthPossible;
        if (virtualEthReserve > k_div_sum) {
            maxEthPossible = virtualEthReserve - k_div_sum;
        } else {
            maxEthPossible = 0;
        }

        bool canReachTargetTheoretically = maxEthPossible >= _effectiveLiquidityTarget;
        // This event now reflects theoretical reachability of the _effectiveLiquidityTarget used for setup.
        emit CurveVerification(maxEthPossible, _effectiveLiquidityTarget, canReachTargetTheoretically);
        
        // The curve is not strictly trying to make ethRaised == lotteryPool anymore.
    }
    
    // Calculate current token price based on virtual reserves
    function calculateCurrentPrice() public view returns (uint256) {
        if (virtualTokenReserve == 0) return type(uint256).max; // Indicate effectively infinite price
        return (virtualEthReserve * ONE_ETHER) / virtualTokenReserve; // Price in ETH per token, scaled by 1e18
    }

    // Calculate how many tokens will be received for a given ETH amount
    function calculateBuyReturn(uint256 ethAmount) public view returns (uint256) {        
        require(ethAmount > 0, "ETH amount must be > 0");
        if (virtualEthReserve + ethAmount == 0) return 0; // Avoid division by zero if v_eth is 0 and ethAmount is 0 (though caught by require)
        
        // tokens_received = v_tokens_old - k / (v_eth_old + eth_amount)
        // k is scaled down by 1e18, so k * 1e18 to get original scale product
        uint256 k_scaled = constant_k * ONE_ETHER; 
        uint256 newVirtualEthReserve = virtualEthReserve + ethAmount;
        if (newVirtualEthReserve == 0) return virtualTokenReserve; // Prevent division by zero, implies all tokens out

        uint256 newVirtualTokenReserve = k_scaled / newVirtualEthReserve;
        
        if (virtualTokenReserve > newVirtualTokenReserve) {
            return virtualTokenReserve - newVirtualTokenReserve;
        }
        return 0; // Should not receive negative or zero tokens if buying
    }

    // Calculate how much ETH will be returned for a given token amount
    function calculateSellReturn(uint256 tokenAmount) public view returns (uint256) {
        require(tokenAmount > 0, "Token amount must be > 0");
        // If isReservedSupplyActive is true, virtualTokenReserve already includes the reserved tokens.
        // If it's false, virtualTokenReserve is for the initial phase.
        // The calculation remains valid as it uses the current state of virtualTokenReserve.
        if (virtualTokenReserve == 0) return virtualEthReserve; // Avoid division by zero if trying to add tokens to a depleted reserve
        
        uint256 effectiveVirtualTokenReserve = virtualTokenReserve;
        if (tokenAmount > effectiveVirtualTokenReserve && effectiveVirtualTokenReserve < tokenAmount ) {
             // This case is tricky. If selling more tokens than current vTokens,
             // this implies the curve is empty or near empty from the token side.
             // The formula might break down or give unexpected results.
             // However, calculateSellReturn is generally called with tokens the user *has*,
             // which should be <= tokens ever sold by the curve.
             // And totalTokensSoldFromCurve should not exceed INITIAL_SUPPLY.
        }


        // eth_received = v_eth_old - k / (v_tokens_old + token_amount)
        // k is scaled down by 1e18, so k * 1e18
        uint256 k_scaled = constant_k * ONE_ETHER;
        uint256 newVirtualTokenReserve = effectiveVirtualTokenReserve + tokenAmount;
        if (newVirtualTokenReserve == 0) return virtualEthReserve; // Prevent division by zero, implies all ETH out

        uint256 newVirtualEthReserve = k_scaled / newVirtualTokenReserve;

        if (virtualEthReserve > newVirtualEthReserve) {
            return virtualEthReserve - newVirtualEthReserve;
        }
        return 0; // Should not return negative or zero ETH if selling valid amount
    }

    // Buy tokens with ETH
    function buy() public payable {
        require(msg.value >= MIN_BUY, "Below minimum buy amount");
        
        uint256 grossEthAmount = msg.value;
        uint256 totalFeesPaid = 0;
        uint256 lotteryFeeApplied = 0;

        // Apply fees
        if (isLotteryTaxActive) {
            lotteryFeeApplied = (grossEthAmount * LOTTERY_POOL_FEE_NUMERATOR) / LOTTERY_POOL_FEE_DENOMINATOR;
            accumulatedLotteryTax += lotteryFeeApplied;
            totalFeesPaid += lotteryFeeApplied;

            if (accumulatedLotteryTax >= lotteryPool) {
                if (!isReservedSupplyActive) { // Activate reserved supply only once when condition met
                    _activateReservedSupply();
                }
                isLotteryTaxActive = false;
                emit LotteryTaxStatusChanged(false);
            }
        }

        uint256 holderFee = (grossEthAmount * HOLDER_POOL_FEE_NUMERATOR) / HOLDER_POOL_FEE_DENOMINATOR;
        accumulatedHolderTax += holderFee;
        totalFeesPaid += holderFee;

        uint256 protocolFee = (grossEthAmount * PROTOCOL_POOL_FEE_NUMERATOR) / PROTOCOL_POOL_FEE_DENOMINATOR;
        accumulatedProtocolTax += protocolFee;
        totalFeesPaid += protocolFee;

        uint256 devFee = (grossEthAmount * DEV_FEE_NUMERATOR) / DEV_FEE_DENOMINATOR;
        accumulatedDevTax += devFee;
        totalFeesPaid += devFee;

        require(grossEthAmount >= totalFeesPaid, "Fees exceed sent amount");
        uint256 netEthForCurve = grossEthAmount - totalFeesPaid;
        
        require(netEthForCurve > 0, "Net ETH for curve is zero after fees");

        uint256 tokensToTransfer = calculateBuyReturn(netEthForCurve);
        require(tokensToTransfer > 0, "Would receive zero tokens for net ETH");
        
        // Max tokens the curve will ever sell is INITIAL_SUPPLY.
        // totalTokensSoldFromCurve tracks all tokens sold.
        uint256 tokensRemainingInContractForSale = INITIAL_SUPPLY - totalTokensSoldFromCurve;
        require(tokensToTransfer <= tokensRemainingInContractForSale, "Purchase exceeds total available supply for curve");
        require(tokensToTransfer <= balanceOf(address(this)), "Not enough tokens in contract balance (overall check)");
        
        // Update state
        ethRaised += netEthForCurve; 
        totalTokensSoldFromCurve += tokensToTransfer;
        
        virtualEthReserve += netEthForCurve; 
        if (virtualEthReserve == 0) { 
            virtualTokenReserve = type(uint256).max; 
        } else {
            virtualTokenReserve = (constant_k * ONE_ETHER) / virtualEthReserve;
        }
        
        _transfer(address(this), msg.sender, tokensToTransfer);
                
        emit TokensPurchased(msg.sender, grossEthAmount, netEthForCurve, tokensToTransfer, lotteryFeeApplied);
    }

    // Sell tokens to get ETH back
    function sell(uint256 tokenAmount) public {
        require(tokenAmount > 0, "Must sell more than 0 tokens");
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");   

        uint256 ethToReturn = calculateSellReturn(tokenAmount);
        require(ethToReturn > 0, "Would receive zero ETH");
        require(ethToReturn <= address(this).balance, "Contract has insufficient ETH for this sell");
        // ethRaised can decrease below zero if sells exceed buys after fees.
        // This check needs to be against virtualEthReserve or a similar measure of liquidity.
        // Let's ensure ethToReturn <= virtualEthReserve, as that's the curve's ETH.
        require(ethToReturn <= virtualEthReserve, "Sell amount exceeds curve's virtual ETH reserve");


        // Update state
        _transfer(msg.sender, address(this), tokenAmount);
        
        // totalTokensSoldFromCurve should decrease if tokens are returned to the curve.
        // This means they are available again to be sold via buy() up to the maxTokensForCurve limit.
        if (totalTokensSoldFromCurve >= tokenAmount) {
            totalTokensSoldFromCurve -= tokenAmount;
        } else {
            totalTokensSoldFromCurve = 0; // Safety, should not go negative
        }
        
        ethRaised -= ethToReturn; // r_eth decreases

        // Update virtual reserves for the sell operation
        // v_tokens_new = v_tokens_old + token_amount
        // v_eth_new = k / v_tokens_new
        virtualTokenReserve += tokenAmount;
        if (virtualTokenReserve == 0) { // Should not happen if tokenAmount > 0
            virtualEthReserve = type(uint256).max; // Or handle as error
        } else {
            virtualEthReserve = (constant_k * ONE_ETHER) / virtualTokenReserve;
        }
        
        payable(msg.sender).transfer(ethToReturn);
        
        emit TokensSold(msg.sender, tokenAmount, ethToReturn);
    }

    // Fund the lottery pool with ETH
    function addToLotteryPool() external payable {
        _addToLotteryPoolInternal(msg.value);
    }

    function _addToLotteryPoolInternal(uint256 _value) internal {
        require(_value > 0, "Must add positive ETH amount to lottery pool");
        require(lotteryPool + _value <= MAX_LOTTERY_POOL, "Would exceed maximum lottery pool");
        
        lotteryPool += _value;
        // Re-calculating curve parameters when lottery pool changes might need careful consideration
        // if the reserved supply has already been activated.
        // For now, assuming this is called before activation, or needs further logic if called after.
        // If called after activation, _initializeCurveFirstPhase() would reset to phase 1 logic.
        // This interaction needs more thought if addToLotteryPool can be called anytime.
        // For now, let's assume it primarily affects the initial setup or a full reset.
        if (!isReservedSupplyActive) {
            _initializeCurveFirstPhase(); // Re-initialize based on new lottery pool for phase 1
        } else {
            // If reserved supply is active, changing lotteryPool and re-initializing
            // would reset the curve to phase 1, potentially "deactivating" the reserve
            // until the new (potentially higher) lotteryPool target is met again.
            // This might be complex. For simplicity, one might restrict addToLotteryPool
            // to before reserved supply activation or define a clear reset behavior.
            // Current behavior: It will re-run _initializeCurveFirstPhase.
             _initializeCurveFirstPhase(); // This will effectively reset to phase 1 calculations
                                          // and isReservedSupplyActive would need to become false again
                                          // if we want the sequence to re-trigger.
                                          // This part needs careful design if addToLotteryPool is used post-activation.
                                          // A simpler model might be: lotteryPool is fixed after first buy.
        }
        
        emit LotteryPoolUpdated(lotteryPool);
    }

    // Helper function to check migration status (now, if lottery target is met)
    function isLotteryTargetMet() public view returns (bool) {
        return accumulatedLotteryTax >= lotteryPool; // Or simply !isLotteryTaxActive after first trigger
    }

    // Getter for the total number of tokens potentially managed and sold by the curve.
    function getMaxTokensForCurve() public view returns (uint256) {
        return INITIAL_SUPPLY; // The curve can theoretically sell up to all tokens over time
    }

    // Getter for tokens that are part of the initial curve setup phase
    function getTokensForInitialCurvePhase() public view returns (uint256) {
        return INITIAL_SUPPLY - reservedSupplyAmount;
    }

    // Function to get the remaining tokens from the reserved supply that are available for sale
    function getRemainingReservedSupplyForSale() public view returns (uint256) {
        if (!isReservedSupplyActive) {
            return 0;
        }
        uint256 initialPhaseTokens = getTokensForInitialCurvePhase();
        if (totalTokensSoldFromCurve <= initialPhaseTokens) {
            // Still in the initial phase (or exactly at the boundary), so all reserved supply is notionally available
            return reservedSupplyAmount;
        }
        uint256 soldFromReserved = totalTokensSoldFromCurve - initialPhaseTokens;
        if (soldFromReserved >= reservedSupplyAmount) {
            return 0; // All reserved supply has been sold
        }
        return reservedSupplyAmount - soldFromReserved;
    }
}
