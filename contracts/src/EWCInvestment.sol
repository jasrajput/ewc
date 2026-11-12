// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEWCCommissionPool {
    function usdtReserve() external view returns (uint256);
    function ewcRoiReserve() external view returns (uint256);
}

interface IPancakeRouterV2 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IPancakePairV2 {
    function token0() external view returns (address);
    function token1() external view returns (address);

    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/**
 * @title EWC Investment
 * @notice USDT investment contract with PancakeSwap EWC purchasing.
 *
 * Fund distribution:
 * - 20%: EWC market purchase
 * - 40%: Commission pool
 * - 40%: Treasury
 *
 * User EWC allocation is calculated from the full USDT deposit
 * using the EWC/USDT price before the protocol market purchase.
 */
contract EWCInvestment is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    // CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10_000;
    uint256 public constant EWC_PURCHASE_BPS = 2_000;
    uint256 public constant COMMISSION_BPS = 4_000;
    /**
     * @notice Global 3-second deposit cooldown.
     * @dev Limits rapid consecutive deposits and prevents splitting
     *      the max deposit across multiple calls in one block.
     *      Does not prevent single-deposit price manipulation.
     *      May temporarily delay other users' deposits.
     */
    uint256 public constant DEPOSIT_COOLDOWN = 3 seconds;

    // ============================================================
    // EXTERNAL CONTRACTS
    // ============================================================

    IERC20 public immutable usdt;
    IERC20 public immutable ewc;

    IPancakeRouterV2 public immutable pancakeRouter;
    IPancakePairV2 public immutable pancakePair;
    IEWCCommissionPool public immutable commissionPool;

    uint8 public immutable usdtDecimals;

    // ============================================================
    // ADMIN
    // ============================================================

    address public treasury;

    // ============================================================
    // DEPOSIT CONFIGURATION
    // ============================================================

    uint256 public immutable minDeposit;
    uint256 public immutable maxDeposit;

    // ============================================================
    // USER DATA
    // ============================================================

    struct User {
        uint256 totalDepositedUSDT;
        uint256 totalAllocatedEWC;
        uint256 totalMarketBoughtEWC;
        uint256 depositCount;
        uint256 firstDepositTime;
        uint256 lastDepositTime;
    }

    struct Deposit {
        address payer;
        uint256 usdtAmount;
        uint256 allocationPrice;
        uint256 allocatedEWC;
        uint256 marketBuyUSDT;
        uint256 marketBoughtEWC;
        uint256 commissionUSDT;
        uint256 treasuryUSDT;
        uint256 timestamp;
    }

    mapping(address => User) public users;
    mapping(address => Deposit[]) private _deposits;

    // ============================================================
    // GLOBAL STATISTICS
    // ============================================================

    uint256 public totalUsers;
    uint256 public lastGlobalDepositTime;

    uint256 public totalDepositedUSDT;
    uint256 public totalAllocatedEWC;

    uint256 public totalMarketBuyUSDT;
    uint256 public totalMarketBoughtEWC;

    uint256 public totalCommissionUSDTAllocated;
    uint256 public totalTreasuryUSDTAllocated;

    // ============================================================
    // EVENTS
    // ============================================================

    event Deposited(
        address indexed payer,
        address indexed beneficiary,
        uint256 usdtAmount,
        uint256 allocationPrice,
        uint256 allocatedEWC,
        uint256 marketBuyUSDT,
        uint256 marketBoughtEWC,
        uint256 commissionUSDT,
        uint256 treasuryUSDT,
        uint256 timestamp
    );

    event EWCPurchased(
        address indexed beneficiary,
        uint256 usdtSpent,
        uint256 ewcReceived,
        uint256 timestamp
    );

    event TreasuryChanged(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    // ============================================================
    // ERRORS
    // ============================================================

    error ZeroAddress();
    error InvalidAmount();
    error BelowMinimumDeposit();
    error AboveMaximumDeposit();
    error DepositCooldownActive();
    error InvalidPair();
    error InvalidPrice();
    error InsufficientSwapOutput();
    error InsufficientAllocation();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _usdt USDT token address.
     * @param _ewc EWC token address.
     * @param _router PancakeSwap V2 router address.
     * @param _pair EWC/USDT PancakeSwap V2 pair address.
     * @param _commissionPool Commission pool contract address.
     * @param _treasury Treasury wallet address.
     * @param _minDeposit Minimum USDT deposit.
     * @param _maxDeposit Maximum USDT deposit.
     */
    constructor(
        address _usdt,
        address _ewc,
        address _router,
        address _pair,
        address _commissionPool,
        address _treasury,
        uint256 _minDeposit,
        uint256 _maxDeposit
    ) Ownable(msg.sender) {
        if (
            _usdt == address(0) ||
            _ewc == address(0) ||
            _router == address(0) ||
            _pair == address(0) ||
            _commissionPool == address(0) ||
            _treasury == address(0)
        ) revert ZeroAddress();

        if (_minDeposit == 0 || _maxDeposit < _minDeposit) {
            revert InvalidAmount();
        }

        usdt = IERC20(_usdt);
        ewc = IERC20(_ewc);

        pancakeRouter = IPancakeRouterV2(_router);
        pancakePair = IPancakePairV2(_pair);
        commissionPool = IEWCCommissionPool(_commissionPool);

        treasury = _treasury;
        minDeposit = _minDeposit;
        maxDeposit = _maxDeposit;

        usdtDecimals = IERC20Metadata(_usdt).decimals();

        address token0 = pancakePair.token0();
        address token1 = pancakePair.token1();

        bool validPair = (token0 == _ewc && token1 == _usdt) ||
            (token0 == _usdt && token1 == _ewc);

        if (!validPair) revert InvalidPair();
    }

    // ============================================================
    // DEPOSIT FUNCTIONS
    // ============================================================

    /**
     * @notice Deposit USDT for yourself.
     * @param minEwcOut Minimum EWC output from the 20% market purchase.
     * @param minAllocatedEWC Minimum acceptable EWC investment allocation.
     */
    function deposit(
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC
    ) external nonReentrant {
        _deposit(
            msg.sender,
            msg.sender,
            usdtAmount,
            minEwcOut,
            minAllocatedEWC
        );
    }

    /**
     * @notice Deposit USDT for another beneficiary.
     */
    function depositFor(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC
    ) external nonReentrant {
        if (beneficiary == address(0)) revert ZeroAddress();

        _deposit(
            msg.sender,
            beneficiary,
            usdtAmount,
            minEwcOut,
            minAllocatedEWC
        );
    }

    /**
     * @dev Records EWC allocation without transferring tokens to users.
     *      Rewards are calculated off-chain and distributed through
     *      a separate Merkle-based payout contract.
     */

    function _deposit(
        address payer,
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC
    ) internal {
        if (block.timestamp < lastGlobalDepositTime + DEPOSIT_COOLDOWN) {
            revert DepositCooldownActive();
        }

        if (usdtAmount < minDeposit) revert BelowMinimumDeposit();
        if (usdtAmount > maxDeposit) revert AboveMaximumDeposit();
        if (minEwcOut == 0) revert InvalidAmount();

        // Calculate EWC allocation before the market purchase.
        uint256 allocationPrice = getCurrentEwcPrice();
        if (allocationPrice == 0) revert InvalidPrice();

        uint256 allocatedEWC = _calculateEwcFromUSDT(
            usdtAmount,
            allocationPrice
        );

        if (allocatedEWC < minAllocatedEWC) {
            revert InsufficientAllocation();
        }

        // Calculate fund distribution.
        uint256 marketBuyUSDT = (usdtAmount * EWC_PURCHASE_BPS) / BPS;
        uint256 commissionUSDT = (usdtAmount * COMMISSION_BPS) / BPS;
        uint256 treasuryUSDT = usdtAmount - marketBuyUSDT - commissionUSDT;

        // Collect USDT and distribute funds.
        usdt.safeTransferFrom(payer, address(this), usdtAmount);
        usdt.safeTransfer(address(commissionPool), commissionUSDT);
        usdt.safeTransfer(treasury, treasuryUSDT);

        // Buy EWC using 20% of the deposit.
        uint256 marketBoughtEWC = _buyEwc(
            beneficiary,
            marketBuyUSDT,
            minEwcOut
        );

        // Update beneficiary data.
        User storage u = users[beneficiary];

        if (u.depositCount == 0) {
            u.firstDepositTime = block.timestamp;
            totalUsers++;
        }

        u.totalDepositedUSDT += usdtAmount;
        u.totalAllocatedEWC += allocatedEWC;
        u.totalMarketBoughtEWC += marketBoughtEWC;
        u.depositCount++;
        u.lastDepositTime = block.timestamp;

        // Update global statistics.
        totalDepositedUSDT += usdtAmount;
        totalAllocatedEWC += allocatedEWC;
        totalMarketBuyUSDT += marketBuyUSDT;
        totalMarketBoughtEWC += marketBoughtEWC;
        totalCommissionUSDTAllocated += commissionUSDT;
        totalTreasuryUSDTAllocated += treasuryUSDT;
        lastGlobalDepositTime = block.timestamp;

        // Save deposit history.
        _deposits[beneficiary].push(
            Deposit({
                payer: payer,
                usdtAmount: usdtAmount,
                allocationPrice: allocationPrice,
                allocatedEWC: allocatedEWC,
                marketBuyUSDT: marketBuyUSDT,
                marketBoughtEWC: marketBoughtEWC,
                commissionUSDT: commissionUSDT,
                treasuryUSDT: treasuryUSDT,
                timestamp: block.timestamp
            })
        );

        emit Deposited(
            payer,
            beneficiary,
            usdtAmount,
            allocationPrice,
            allocatedEWC,
            marketBuyUSDT,
            marketBoughtEWC,
            commissionUSDT,
            treasuryUSDT,
            block.timestamp
        );
    }

    // ============================================================
    // PANCAKESWAP MARKET PURCHASE
    // ============================================================

    /**
     * @dev Uses 20% of deposited USDT to buy EWC.
     *      EWC is received here first to satisfy token launch rules,
     *      then forwarded to the commission pool.
     */
    function _buyEwc(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut
    ) internal returns (uint256 ewcReceived) {
        if (usdtAmount == 0) revert InvalidAmount();

        usdt.forceApprove(address(pancakeRouter), usdtAmount);

        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(ewc);

        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            usdtAmount,
            minEwcOut,
            path,
            address(this),
            block.timestamp + 300
        );

        ewcReceived = amounts[amounts.length - 1];

        if (ewcReceived == 0) revert InsufficientSwapOutput();

        ewc.safeTransfer(address(commissionPool), ewcReceived);

        emit EWCPurchased(
            beneficiary,
            usdtAmount,
            ewcReceived,
            block.timestamp
        );

        return ewcReceived;
    }

    // ============================================================
    // EWC ALLOCATION CALCULATION
    // ============================================================

    /**
     * @dev Calculates EWC allocation from the full USDT deposit.
     *      Allocation is accounting-only; no EWC is immediately
     *      transferred or made claimable.
     */
    function _calculateEwcFromUSDT(
        uint256 usdtAmount,
        uint256 ewcPrice
    ) internal view returns (uint256) {
        if (ewcPrice == 0) revert InvalidPrice();

        uint256 normalizedUSDT = (usdtAmount * 1e18) /
            (10 ** uint256(usdtDecimals));

        return (normalizedUSDT * 1e18) / ewcPrice;
    }

    // ============================================================
    // FRONTEND ALLOCATION PREVIEW
    // ============================================================

    /**
     * @notice Returns the current EWC price and expected allocation.
     */
    function previewEwcAllocation(
        uint256 usdtAmount
    ) external view returns (uint256 ewcPrice, uint256 allocatedEWC) {
        ewcPrice = getCurrentEwcPrice();

        if (ewcPrice == 0) return (0, 0);

        allocatedEWC = _calculateEwcFromUSDT(usdtAmount, ewcPrice);
    }

    // ============================================================
    // FUND ROUTING PREVIEW
    // ============================================================

    /**
     * @notice Returns the 20/40/40 USDT distribution.
     */
    function getFundAllocation(
        uint256 usdtAmount
    )
        external
        pure
        returns (
            uint256 marketBuyUSDT,
            uint256 commissionUSDT,
            uint256 treasuryUSDT
        )
    {
        marketBuyUSDT = (usdtAmount * EWC_PURCHASE_BPS) / BPS;
        commissionUSDT = (usdtAmount * COMMISSION_BPS) / BPS;
        treasuryUSDT = usdtAmount - marketBuyUSDT - commissionUSDT;
    }

    // ============================================================
    // CURRENT EWC PRICE
    // ============================================================

    /**
     * @notice Returns the EWC/USDT spot price with 18 decimals.
     * @dev Uses PancakeSwap V2 reserves before the protocol market buy.
     *      This price is manipulable and is not a TWAP.
     */
    function getCurrentEwcPrice() public view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, ) = pancakePair.getReserves();

        if (reserve0 == 0 || reserve1 == 0) return 0;

        uint256 ewcReserve;
        uint256 usdtReserveAmount;

        if (pancakePair.token0() == address(ewc)) {
            ewcReserve = uint256(reserve0);
            usdtReserveAmount = uint256(reserve1);
        } else {
            ewcReserve = uint256(reserve1);
            usdtReserveAmount = uint256(reserve0);
        }

        return
            (usdtReserveAmount * 1e36) /
            (ewcReserve * (10 ** uint256(usdtDecimals)));
    }

    // ============================================================
    // USER SUMMARY
    // ============================================================

    /**
     * @notice Returns a user's total investment information.
     */
    function getUserSummary(
        address user
    )
        external
        view
        returns (
            uint256 depositedUSDT,
            uint256 allocatedEWC,
            uint256 marketBoughtEWC,
            uint256 depositCount,
            uint256 firstDepositTime,
            uint256 lastDepositTime
        )
    {
        User memory u = users[user];

        return (
            u.totalDepositedUSDT,
            u.totalAllocatedEWC,
            u.totalMarketBoughtEWC,
            u.depositCount,
            u.firstDepositTime,
            u.lastDepositTime
        );
    }

    // ============================================================
    // INVESTMENT HISTORY
    // ============================================================

    /**
     * @notice Returns the number of deposits for a user.
     */
    function getUserDepositCount(address user) external view returns (uint256) {
        return _deposits[user].length;
    }

    /**
     * @notice Returns a specific deposit by index.
     */
    function getUserDeposit(
        address user,
        uint256 index
    )
        external
        view
        returns (
            address payer,
            uint256 usdtAmount,
            uint256 allocationPrice,
            uint256 allocatedEWC,
            uint256 marketBuyUSDT,
            uint256 marketBoughtEWC,
            uint256 commissionUSDT,
            uint256 treasuryUSDT,
            uint256 timestamp
        )
    {
        Deposit memory d = _deposits[user][index];

        return (
            d.payer,
            d.usdtAmount,
            d.allocationPrice,
            d.allocatedEWC,
            d.marketBuyUSDT,
            d.marketBoughtEWC,
            d.commissionUSDT,
            d.treasuryUSDT,
            d.timestamp
        );
    }

    // ============================================================
    // COMMISSION POOL BALANCES
    // ============================================================

    /**
     * @notice Returns USDT and EWC reserve balances reported by the pool.
     */
    function getCommissionPoolBalances()
        external
        view
        returns (uint256 usdtIncomeReserve, uint256 ewcRoiReserve)
    {
        return (commissionPool.usdtReserve(), commissionPool.ewcRoiReserve());
    }

    // ============================================================
    // PROTOCOL STATISTICS
    // ============================================================

    /**
     * @notice Returns global investment and fund allocation statistics.
     */
    function getProtocolStats()
        external
        view
        returns (
            uint256 usersCount,
            uint256 depositedUSDT,
            uint256 allocatedEWC,
            uint256 marketBuyUSDT,
            uint256 marketBoughtEWC,
            uint256 commissionUSDT,
            uint256 treasuryUSDT
        )
    {
        return (
            totalUsers,
            totalDepositedUSDT,
            totalAllocatedEWC,
            totalMarketBuyUSDT,
            totalMarketBoughtEWC,
            totalCommissionUSDTAllocated,
            totalTreasuryUSDTAllocated
        );
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Updates the treasury wallet.
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryChanged(oldTreasury, newTreasury);
    }
}
