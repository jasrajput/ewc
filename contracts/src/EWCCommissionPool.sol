// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EWCCommissionPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    IERC20 public immutable ewc;

    address public payoutContract;

    uint256 public totalUsdtPaid;
    uint256 public totalEwcPaid;

    event PayoutContractUpdated(address indexed oldContract, address indexed newContract);
    event USDTIncomePaid(address indexed user, uint256 amount);
    event EWCRoiPaid(address indexed user, uint256 amount);

    error NotPayoutContract();
    error ZeroAddress();
    error InsufficientUSDT();
    error InsufficientEWC();

    modifier onlyPayoutContract() {
        if (msg.sender != payoutContract) revert NotPayoutContract();
        _;
    }

    constructor(address _usdt, address _ewc) Ownable(msg.sender) {
        if (_usdt == address(0) || _ewc == address(0)) revert ZeroAddress();

        usdt = IERC20(_usdt);
        ewc = IERC20(_ewc);
    }

    function setPayoutContract(address _payoutContract) external onlyOwner {
        if (_payoutContract == address(0)) revert ZeroAddress();

        address oldContract = payoutContract;
        payoutContract = _payoutContract;

        emit PayoutContractUpdated(oldContract, _payoutContract);
    }

    function payUSDT(address to, uint256 amount) external onlyPayoutContract nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (usdt.balanceOf(address(this)) < amount) revert InsufficientUSDT();

        totalUsdtPaid += amount;
        usdt.safeTransfer(to, amount);

        emit USDTIncomePaid(to, amount);
    }

    function payEWC(address to, uint256 amount) external onlyPayoutContract nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (ewc.balanceOf(address(this)) < amount) revert InsufficientEWC();

        totalEwcPaid += amount;
        ewc.safeTransfer(to, amount);

        emit EWCRoiPaid(to, amount);
    }

    function getBalances() external view returns (uint256 usdtBalance, uint256 ewcBalance) {
        return (
            usdt.balanceOf(address(this)),
            ewc.balanceOf(address(this))
        );
    }

    function usdtReserve() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function ewcRoiReserve() external view returns (uint256) {
        return ewc.balanceOf(address(this));
    }
}