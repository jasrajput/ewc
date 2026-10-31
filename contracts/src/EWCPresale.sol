// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Per-wallet cooldown and per-block restrictions apply to the payer.
///      Neither restriction prevents Sybil activity across multiple wallets.
/// @title EWCPresale
/// @notice Accepts USDT and records fixed-price EWC allocation commitments.
/// @dev Does NOT mint, transfer, escrow or vest EWC. A separate, disclosed
///      fulfillment mechanism is required to deliver the recorded allocations.
///      Commission calculations and claims are handled outside this contract.
contract EWCPresale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant DEPOSIT_COOLDOWN = 3 seconds;
    // uint256 public constant PRESALE_START = 1793491200; // Nov 1, 2026 00:00 UTC
    // uint256 public constant PRESALE_END = 1796083200;   // Dec 1, 2026 00:00 UTC (exclusive)

    uint256 public constant PRESALE_START = 0;
    uint256 public constant PRESALE_END = type(uint256).max;
    
    uint256 public constant PRESALE_PRICE = 1e16;      // $0.01, 18-decimal price

    IERC20 public immutable usdt;
    uint8 public immutable usdtDecimals;
    uint256 public immutable minDeposit;
    uint256 public immutable maxDeposit;

    address public treasury;
    // Anti-spam controls apply to the paying wallet (msg.sender), not globally.
    mapping(address => uint256) public lastDepositTime;
    mapping(address => uint256) public lastActionBlock;
    uint256 public totalUsers;
    uint256 public totalDepositedUSDT;
    uint256 public totalAllocatedEWC;
    uint256 public totalBonusEWC;

    struct User {
        uint256 totalDepositedUSDT;
        uint256 totalAllocatedEWC;
        uint256 totalBonusEWC;
        uint256 depositCount;
        uint256 firstDepositTime;
        uint256 lastDepositTime;
    }

    struct Deposit {
        address payer;
        uint256 usdtAmount;
        uint256 allocatedEWC;
        uint256 bonusEWC;
        uint256 timestamp;
        uint256 unlockAt;
    }

    mapping(address => User) public users;
    mapping(address => Deposit[]) private _deposits;

    event Deposited(
        address indexed payer,
        address indexed beneficiary,
        uint256 usdtAmount,
        uint256 allocatedEWC,
        uint256 bonusEWC,
        uint256 timestamp
    );
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();
    error InvalidToken();
    error InvalidTokenDecimals();
    error PresaleNotActive();
    error DepositCooldownActive();
    error OneActionPerBlock();
    error BelowMinimumDeposit();
    error AboveMaximumDeposit();
    error UnsupportedFeeOnTransferToken();
    error UnexpectedEwcAllocation();

    /// @param _usdt Address of the USDT token on the target chain.
    /// @param _treasury Wallet receiving 100% of presale USDT deposits.
    constructor(address _usdt, address _treasury) Ownable(msg.sender) {
        if (_usdt == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_usdt.code.length == 0) revert InvalidToken();

        uint8 decimals_ = IERC20Metadata(_usdt).decimals();
        if (decimals_ > 18) revert InvalidTokenDecimals();

        usdt = IERC20(_usdt);
        usdtDecimals = decimals_;
        minDeposit = 10 * (10 ** uint256(decimals_));
        maxDeposit = 100_000 * (10 ** uint256(decimals_));
        treasury = _treasury;
    }

    function isPresaleActive() public view returns (bool) {
        return block.timestamp >= PRESALE_START && block.timestamp < PRESALE_END;
    }

    /// @notice Purchase a presale allocation for the caller.
    function deposit(uint256 usdtAmount) external nonReentrant {
        _deposit(msg.sender, msg.sender, usdtAmount);
    }

    /// @notice Purchase a presale allocation for another beneficiary.
    /// @dev USDT is taken from msg.sender; the allocation belongs to beneficiary.
    function depositFor(address beneficiary, uint256 usdtAmount) external nonReentrant {
        if (beneficiary == address(0)) revert ZeroAddress();
        _deposit(msg.sender, beneficiary, usdtAmount);
    }

    function _deposit(address payer, address beneficiary, uint256 usdtAmount) internal {
        if (!isPresaleActive()) revert PresaleNotActive();
        // One successful deposit per payer per block.
        if (lastActionBlock[payer] == block.number) revert OneActionPerBlock();

        // A payer can deposit again only after three seconds have elapsed.
        // The zero timestamp means the payer has never deposited.
        uint256 previousDepositTime = lastDepositTime[payer];
        if (
            previousDepositTime != 0 &&
            block.timestamp - previousDepositTime < DEPOSIT_COOLDOWN
        ) revert DepositCooldownActive();
        if (usdtAmount < minDeposit) revert BelowMinimumDeposit();
        if (usdtAmount > maxDeposit) revert AboveMaximumDeposit();

        (uint256 baseEWC, uint256 bonusEWC, uint256 allocatedEWC, ) =
            quoteDeposit(usdtAmount);
        if (baseEWC == 0 || allocatedEWC == 0) revert UnexpectedEwcAllocation();

        // Reject tokens that do not deliver the exact requested amount.
        uint256 beforeBalance = usdt.balanceOf(treasury);
        usdt.safeTransferFrom(payer, treasury, usdtAmount);
        uint256 afterBalance = usdt.balanceOf(treasury);
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != usdtAmount) {
            revert UnsupportedFeeOnTransferToken();
        }

        User storage user = users[beneficiary];
        if (user.depositCount == 0) {
            ++totalUsers;
            user.firstDepositTime = block.timestamp;
        }

        user.totalDepositedUSDT += usdtAmount;
        user.totalAllocatedEWC += allocatedEWC;
        user.totalBonusEWC += bonusEWC;
        ++user.depositCount;
        user.lastDepositTime = block.timestamp;

        totalDepositedUSDT += usdtAmount;
        totalAllocatedEWC += allocatedEWC;
        totalBonusEWC += bonusEWC;
        lastDepositTime[payer] = block.timestamp;
        lastActionBlock[payer] = block.number;

        _deposits[beneficiary].push(Deposit({
            payer: payer,
            usdtAmount: usdtAmount,
            allocatedEWC: allocatedEWC,
            bonusEWC: bonusEWC,
            timestamp: block.timestamp,
            unlockAt: block.timestamp + 5 * 365 days
        }));

        emit Deposited(
            payer,
            beneficiary,
            usdtAmount,
            allocatedEWC,
            bonusEWC,
            block.timestamp
        );
    }

    /// @notice Bonus is based on the amount of this deposit, not lifetime deposits.
    function getPresaleBonusBps(uint256 usdtAmount) public view returns (uint256) {
        uint256 unit = 10 ** uint256(usdtDecimals);
        if (usdtAmount >= 75_000 * unit) return 10_000; // 100%
        if (usdtAmount >= 50_000 * unit) return 8_500;  // 85%
        if (usdtAmount >= 40_000 * unit) return 7_000;  // 70%
        if (usdtAmount >= 25_000 * unit) return 6_000;  // 60%
        if (usdtAmount >= 10_000 * unit) return 5_000;  // 50%
        if (usdtAmount >= 6_000 * unit) return 4_000;   // 40%
        if (usdtAmount >= 3_000 * unit) return 3_500;   // 35%
        if (usdtAmount >= 1_000 * unit) return 3_000;   // 30%
        if (usdtAmount >= 650 * unit) return 2_500;     // 25%
        if (usdtAmount >= 300 * unit) return 2_000;     // 20%
        if (usdtAmount >= 100 * unit) return 1_500;     // 15%
        if (usdtAmount >= 30 * unit) return 1_000;      // 10%
        if (usdtAmount >= 10 * unit) return 500;        // 5%
        return 0;
    }

    /// @return baseEWC Base allocation at $0.01 (18 decimals).
    /// @return bonusEWC Bonus allocation (18 decimals).
    /// @return allocatedEWC Total promised allocation (18 decimals).
    /// @return bonusBps Applied bonus in basis points.
    function quoteDeposit(uint256 usdtAmount)
        public
        view
        returns (uint256 baseEWC, uint256 bonusEWC, uint256 allocatedEWC, uint256 bonusBps)
    {
        uint256 usdt18 = usdtAmount * (10 ** uint256(18 - usdtDecimals));
        baseEWC = (usdt18 * 1e18) / PRESALE_PRICE;
        bonusBps = getPresaleBonusBps(usdtAmount);
        bonusEWC = (baseEWC * bonusBps) / BPS;
        allocatedEWC = baseEWC + bonusEWC;
    }

    function getUserDepositCount(address beneficiary) external view returns (uint256) {
        return _deposits[beneficiary].length;
    }

    function getUserDeposit(address beneficiary, uint256 index)
        external
        view
        returns (Deposit memory)
    {
        return _deposits[beneficiary][index];
    }

    function getUserSummary(address beneficiary) external view returns (User memory) {
        return users[beneficiary];
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(previousTreasury, newTreasury);
    }
}
