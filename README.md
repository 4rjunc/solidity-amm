# Bonding Curve AMM

A simple Automated Market Maker (AMM) implementation that uses a bonding curve to determine token prices.

## Overview

This project implements a token bonding curve - a mathematical concept used in decentralized finance (DeFi) where the price of a token is determined by its supply. As the token supply increases, so does the price, following a predefined formula.

## Features

- ERC20-compliant token
- Continuous token issuance based on bonding curve formula
- Configurable reserve ratio parameter
- Buy tokens with ETH
- Sell tokens back for ETH
- Automatic price calculation

## How It Works

### Bonding Curve Explained

A bonding curve is a mathematical function that defines the relationship between a token's price and its supply. In this implementation:

- The token price increases as more tokens are minted
- The token price decreases as tokens are burned
- The price is determined by the formula: `price = reserveBalance / (totalSupply * reserveRatio/100)`

This creates a predictable price movement based on token supply changes.

#### Formula Visualization

![Bonding Curve Example](https://i.imgur.com/XkfL0Y7.png)

*Example of how a token price follows the bonding curve as supply changes*

### Reserve Ratio

The reserve ratio is a critical parameter that determines the slope of the bonding curve:

- Lower reserve ratio (e.g., 10%) = steeper curve, more price volatility
- Higher reserve ratio (e.g., 50%) = gradual curve, less price volatility

Our implementation allows the reserve ratio to be set between 1-100%.

### Price Determination

The contract uses these formulas:

1. **Current Price**: `(reserveBalance * 1e18) / (totalSupply * reserveRatio / 100)`
2. **Buy Return**: `(ethAmount * currentSupply) / (currentReserve * reserveRatio / 100)`
3. **Sell Return**: `(tokenAmount * currentReserve * reserveRatio / 100) / currentSupply`

These are simplified versions of the Bancor formula for computational efficiency.

## Example Scenarios

### Scenario 1: Initial Purchase

When the pool is empty:
- Initial price is set to 0.001 ETH per token
- Initial exchange rate is 1000 tokens per ETH

### Scenario 2: Supply and Price Change

After adding 10 ETH with a 20% reserve ratio:
- If you buy 2 ETH worth of tokens
- The price will increase due to increased supply
- Selling tokens will decrease the price

### Price Movement Visualization

| Action                | Supply Change | Price Movement |
|-----------------------|---------------|----------------|
| Buy tokens with ETH   | ⬆️ Increases   | ⬆️ Increases    |
| Sell tokens for ETH   | ⬇️ Decreases   | ⬇️ Decreases    |

## Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn
- Hardhat

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/bonding-curve-amm.git
cd bonding-curve-amm
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Create a `.env` file (optional for custom configurations)
```bash
cp .env.example .env
```

### Running Tests

Run the test suite to verify the contract's functionality:

```bash
npx hardhat test
```

You should see output similar to:
```
Initial Supply: 10000.0
Initial Token Price: 0.005
--- BUYING TOKENS ---
Tokens Purchased: 4000.0
Price After Buy: 0.006
Reserve Balance: 12.0
--- SELLING TOKENS ---
Remaining Tokens: 2000.0
Tokens Sold: 2000.0
Price After Sell: 0.0055
Reserve Balance: 11.0
```

### Deploying to a Local Network

1. Start a local Hardhat node
```bash
npx hardhat node
```

2. Deploy the contract
```bash
npx hardhat run scripts/deploy.js --network localhost
```

## Understanding the Math

### Bancor Formula

Our implementation uses a simplified version of the Bancor formula for computational efficiency. The classic Bancor formula is:

```
Return = Supply * ((1 + Deposit/Reserve)^(ReserveRatio) - 1)
```

For small transactions, we approximate this with:
```
Return = Deposit * Supply / (Reserve * ReserveRatio)
```

### Example Calculation

With:
- Reserve balance: 10 ETH
- Total supply: 10,000 tokens
- Reserve ratio: 20%

The token price would be:
```
Price = 10 * 10^18 / (10000 * 20/100) = 0.005 ETH per token
```

If someone buys with 2 ETH, they would receive:
```
Tokens = 2 * 10000 / (10 * 20/100) = 10000 tokens
```

## Security Considerations

- The contract lacks slippage protection
- Large purchases or sales can significantly move the price
- Consider implementing maximum price impact guards for production use

## License

This project is licensed under the MIT License - see the LICENSE file for details.
