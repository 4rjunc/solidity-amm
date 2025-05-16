// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract RandomWalletPicker is VRFConsumerBaseV2Plus {
    // address public owner; // Inherited from ConfirmedOwner via VRFConsumerBaseV2Plus
    address payable[10] public walletAddresses;
    
    // Chainlink VRF Configuration
    bytes32 immutable i_keyHash; 
    uint256 immutable i_subscriptionId;
    uint32 internal i_callbackGasLimit = 200000;
    uint16 internal i_requestConfirmations = 3;  
    uint32 internal i_numWords = 1;

    // Result variables
    uint256 public s_randomWord;
    address payable public pickedWallet;
    uint256 public s_lastRequestId;

    // Events
    event WalletPicked(uint256 indexed requestId, address indexed winner);
    event WalletsSet(address indexed setter, uint256 timestamp); // msg.sender for setter will be owner()
    event RandomnessRequested(uint256 indexed requestId, address requester); // msg.sender for requester will be owner()

    /**
     * @param _initialWallets Array of 10 wallet addresses to pick from
     * @param _vrfCoordinatorAddress VRF Coordinator address 
     * @param _subscriptionId Your uint256 subscription ID from vrf.chain.link
     * @param _keyHash The gas lane key hash 
     */
    constructor(
        address payable[10] memory _initialWallets, 
        address _vrfCoordinatorAddress,
        uint256 _subscriptionId,
        bytes32 _keyHash
    )
        VRFConsumerBaseV2Plus(_vrfCoordinatorAddress)
    {
        i_keyHash = _keyHash;
        i_subscriptionId = _subscriptionId;
        walletAddresses = _initialWallets;
    }

    /**
     * @notice Allows the owner to set the 10 wallet addresses.
     * @param _newWallets The array of 10 new wallet addresses.
     */
    function setWallets(address payable[10] memory _newWallets) public onlyOwner { // Uses inherited onlyOwner
        walletAddresses = _newWallets;
        emit WalletsSet(msg.sender, block.timestamp); // msg.sender will be owner() due to onlyOwner modifier
    }

    /**
     * @notice Requests randomness from Chainlink VRF to pick a wallet.
     * @return requestId The ID of the VRF request.
     */
    function pickRandomWallet() public onlyOwner returns (uint256 requestId) { // Uses inherited onlyOwner
        // Will revert if subscription is not set up and funded correctly for VRF V2.5
        // or if the consumer is not added to the subscription.
        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: i_keyHash,
            subId: i_subscriptionId, // uint256 subscriptionId
            requestConfirmations: i_requestConfirmations,
            callbackGasLimit: i_callbackGasLimit,
            numWords: i_numWords,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false})) // false for LINK payment
        });

        requestId = s_vrfCoordinator.requestRandomWords(req);
        
        s_lastRequestId = requestId;
        emit RandomnessRequested(requestId, msg.sender); // msg.sender will be owner() due to onlyOwner modifier
        return requestId;
    }

    /**
     * @notice Callback function used by VRF Coordinator to return the random number.
     * @param requestId The ID of the request.
     * @param randomWords The array of random numbers provided by the oracle.
     */
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal /*virtual*/ override { // No need for virtual if final
        {
            // The new signature uses 'requestId' and 'randomWords'.
            // The '_args' parameter is no longer present.
            require(requestId == s_lastRequestId, "Invalid request ID");
            require(randomWords.length > 0, "No random words returned");
            
            s_randomWord = randomWords[0];
            uint256 index = s_randomWord % walletAddresses.length;
            pickedWallet = walletAddresses[index];
            
            emit WalletPicked(requestId, pickedWallet);
        }
    }

    /**
     * @notice Gets the last picked wallet address.
     * @return The address of the last picked wallet.
     */
    function getPickedWallet() public view returns (address payable) {
        return pickedWallet;
    }

    /**
     * @notice Gets all stored wallet addresses.
     * @return An array of wallet addresses.
     */
    function getAllWallets() public view returns (address payable[10] memory) {
        return walletAddresses;
    }

    /**
     * @notice Gets the VRF configuration parameters.
     * @return VRF coordinator address, subscription ID, and key hash
     */
    function getVrfParams() external view returns (address, uint256, bytes32) {
        return (address(s_vrfCoordinator), i_subscriptionId, i_keyHash);
    }

    // Fallback function to receive ETH
    receive() external payable {}
}