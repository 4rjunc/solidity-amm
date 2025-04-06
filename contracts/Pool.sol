// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";

contract Pool {
  using Math for uint256;
  using Math for uint32;

  mapping(address => uint256) public balances;
  uint32 slope;
}
