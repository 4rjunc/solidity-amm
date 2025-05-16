const { expect } = require("chai");
const { ethers } = require("hardhat");

// Array of 10 mock wallet addresses for testing
const MOCK_WALLET_ADDRESSES = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
    "0x5555555555555555555555555555555555555555",
    "0x6666666666666666666666666666666666666666",
    "0x7777777777777777777777777777777777777777",
    "0x8888888888888888888888888888888888888888",
    "0x9999999999999999999999999999999999999999",
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
];


const DEPLOYED_RANDOM_WALLET_PICKER_ADDRESS = "0x566Ba21d1c5F37153CF1FD9Ddeb5a0117084FF6B";

describe("RandomWalletPicker with Live VRF (Base Sepolia)", function () {
    let randomWalletPicker;
    let owner;

    beforeEach(async function () {
        if (DEPLOYED_RANDOM_WALLET_PICKER_ADDRESS === "YOUR_DEPLOYED_RANDOM_WALLET_PICKER_ADDRESS_HERE") {
            this.skip(); // Skip tests if address is not set
            // Alternatively, throw new Error("Please set your deployed contract address in the test file.");
        }
        [owner] = await ethers.getSigners();
        
        randomWalletPicker = await ethers.getContractAt("RandomWalletPicker", DEPLOYED_RANDOM_WALLET_PICKER_ADDRESS, owner);

        console.log(`Connected to RandomWalletPicker at: ${await randomWalletPicker.getAddress()}`);
        console.log(`Test signer (owner): ${owner.address}`);
        console.log("Ensure this signer is the owner of the deployed contract for owner-only functions.");
        console.log("Ensure the contract is correctly set up with Chainlink VRF on Base Sepolia and the subscription is funded.");
    });

    describe("Deployment (Querying existing contract)", function () {
        it("Should have the correct owner (ensure test signer is the contract owner)", async function () {
            // This test assumes the 'owner' (signer[0]) from Hardhat is the expected owner of the deployed contract.
            // If your deployed contract has a different owner, this test will fail or needs adjustment.
            expect(await randomWalletPicker.owner()).to.equal(owner.address);
        });

        it("Should have the initial wallet addresses (or currently set addresses)", async function () {
            const storedWallets = await randomWalletPicker.getAllWallets();
            expect(storedWallets.length).to.equal(10);
            // We can't be certain about the exact addresses if they were changed after deployment,
            // but we can check if they are valid addresses.
            storedWallets.forEach(wallet => expect(wallet).to.be.properAddress);
            // If you want to check against MOCK_WALLET_ADDRESSES, ensure they were set during deployment or via setWallets
            // For example: expect(storedWallets[0].toLowerCase()).to.equal(MOCK_WALLET_ADDRESSES[0].toLowerCase());
        });
    });

    describe("pickRandomWallet and fulfillRandomWords (Live VRF)", function () {
        it("Should pick a random wallet using live VRF and receive the callback", async function (done) {
            this.timeout(300000); // 5 minutes timeout for VRF callback

            console.log("\nAttempting to pick a random wallet...");
            console.log("This will send a transaction and wait for the Chainlink VRF callback.");
            console.log("Ensure your contract's VRF subscription is funded on Base Sepolia.");

            // Request randomness
            // Ensure the 'owner' signer is the owner of the contract
            const tx = await randomWalletPicker.pickRandomWallet();
            console.log(`pickRandomWallet transaction sent: ${tx.hash}. Waiting for confirmation...`);
            const receipt = await tx.wait(1); // Wait for 1 confirmation
            console.log("pickRandomWallet transaction confirmed.");

            // Get request ID from the RandomnessRequested event using a more robust query
            const PRandomnessRequested = randomWalletPicker.filters.RandomnessRequested();
            // Use receipt.blockNumber for fromBlock and toBlock
            const eventsInBlock = await randomWalletPicker.queryFilter(PRandomnessRequested, receipt.blockNumber, receipt.blockNumber);
            
            console.log(`Found ${eventsInBlock.length} RandomnessRequested event(s) in block ${receipt.blockNumber}.`);
            console.log(`Looking for transaction hash: ${receipt.hash}`);

            // Filter further to find the event from our specific transaction, if multiple similar events in the block
            let requestId;
            for (const event of eventsInBlock) {
                console.log(`  Event transactionHash: ${event.transactionHash}`);
                if (event.transactionHash === receipt.hash) {
                    console.log("    Matching event found via queryFilter!");
                    requestId = event.args.requestId;
                    break;
                }
            }
            
            if (requestId === undefined) {
                console.error("ERROR: RandomnessRequested event for our transaction was not found in the block's events via queryFilter.");
                // console.log("Receipt details:", JSON.stringify(receipt, null, 2)); // Keep for deeper debugging if needed
                // As a fallback, let's check receipt.logs if available
                if (receipt.logs && receipt.logs.length > 0) {
                    console.log("Attempting to parse receipt.logs as a fallback...");
                    for (const log of receipt.logs) {
                        try {
                            // Ensure the log is from our contract before trying to parse
                            if (log.address.toLowerCase() === randomWalletPicker.address.toLowerCase()) {
                                const parsedLog = randomWalletPicker.interface.parseLog(log);
                                if (parsedLog && parsedLog.name === "RandomnessRequested" && log.transactionHash === receipt.hash) { // Compare with receipt.hash
                                    console.log("    Matching event found in receipt.logs!");
                                    requestId = parsedLog.args.requestId;
                                    break;
                                }
                            }
                        } catch (e) {
                            // Not an event from our contract or not decodable
                        }
                    }
                }
            }

            expect(requestId).to.not.be.undefined; // Ensure our transaction emitted the event

            console.log(`Randomness requested with requestId: ${requestId.toString()}`);
            
            console.log("Waiting for Chainlink VRF to fulfill the request and emit WalletPicked event...");
            console.log("(This might take a few minutes on Base Sepolia)");

            // Wait for the WalletPicked event
            const pickedWalletAddress = await new Promise((resolve, reject) => {
                const eventTimeout = setTimeout(() => {
                    reject(new Error("Timeout: WalletPicked event not received within 5 minutes. Check VRF callback."));
                }, 300000); // 5 minutes

                randomWalletPicker.once("WalletPicked", (eventRequestId, winnerAddress, event) => {
                    clearTimeout(eventTimeout);
                    console.log("\nWalletPicked event listener triggered!");
                    console.log("--------------------------------");
                    console.log("Request ID from our earlier request:", requestId.toString());
                    console.log("Request ID from WalletPicked event:", eventRequestId.toString());
                    console.log("Picked Wallet Address from event:", winnerAddress);
                    console.log("--------------------------------\n");
                    
                    if (eventRequestId.eq(requestId)) {
                        console.log("Request IDs match. Resolving promise with picked wallet.");
                        resolve(winnerAddress);
                    } else {
                        console.error("CRITICAL WARNING: Request IDs do NOT match. This should not happen if only one request is active.");
                        console.error(`Expected: ${requestId.toString()}, Got: ${eventRequestId.toString()}`);
                        // Even if IDs don't match, we should reject to prevent a timeout and fail the test clearly.
                        reject(new Error(`WalletPicked event received, but for unexpected requestId. Expected: ${requestId.toString()}, Got: ${eventRequestId.toString()}`));
                    }
                });
            });

            expect(pickedWalletAddress).to.be.properAddress;
            // Check if the picked wallet is one of the MOCK_WALLET_ADDRESSES
            // This assumes MOCK_WALLET_ADDRESSES are the ones configured in the contract
            const lowerCaseMockWallets = MOCK_WALLET_ADDRESSES.map(addr => addr.toLowerCase());
            expect(lowerCaseMockWallets).to.include(pickedWalletAddress.toLowerCase());
            
            console.log(`Successfully picked wallet: ${pickedWalletAddress}`);

            const storedRandomWord = await randomWalletPicker.s_randomWord();
            console.log("Stored s_randomWord (from Chainlink VRF):", storedRandomWord.toString());
            
            console.log("Verifying with getPickedWallet()...");
            const storedPickedWallet = await randomWalletPicker.getPickedWallet();
            expect(storedPickedWallet.toLowerCase()).to.equal(pickedWalletAddress.toLowerCase());
            console.log(`getPickedWallet() confirmed: ${storedPickedWallet}`);

            done();
        });
    });
}); 