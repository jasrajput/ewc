// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IEWCCommissionPool {
    function usdtReserve() external view returns (uint256);
    function ewcRoiReserve() external view returns (uint256);
}

interface IPancakeRouterV2 {
    function factory() external view returns (address);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IPancakeFactoryV2 {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address);
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
 * @notice USDT investment and EWC allocation accounting contract.
 *
 * Fund distribution:
 * - 20%: EWC market purchase
 * - 40%: Commission pool
 * - 40%: Treasury
 *
 * @dev IMPORTANT TRUST MODEL:
 *
 * Depositors do not receive EWC tokens directly.
 *
 * EWC allocations are recorded for accounting purposes
 * only and are not directly redeemable through this
 * contract.
 *
 * Rewards are calculated off-chain and distributed
 * through a separate Merkle-based payout contract.
 *
 * Payouts depend on the operation, funding and
 * authorization of the external reward distribution
 * system and commission pool.
 *
 * This contract does not guarantee reward payments,
 * returns, or redemption of allocated EWC.
 */

contract EWCInvestment is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============================================================
    // CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10_000;
    uint256 public constant EWC_PURCHASE_BPS = 2_000;
    uint256 public constant COMMISSION_BPS = 4_000;
    uint256 private constant PRICE_CALCULATION_SCALE = 1e36;

    // ============================================================
    // EXTERNAL CONTRACTS
    // ============================================================

    IERC20 public immutable usdt;
    IERC20 public immutable ewc;

    IPancakeRouterV2 public immutable pancakeRouter;
    IPancakePairV2 public immutable pancakePair;
    IEWCCommissionPool public immutable commissionPool;

    address constant BSC_USDT = 0x55d398326f99059fF775485246999027B3197955;
    uint8 public immutable usdtDecimals;

    // ============================================================
    // ADMIN
    // ============================================================

    address public treasury;
    uint256 public constant TREASURY_CHANGE_DELAY = 48 hours;

    address public pendingTreasury;
    uint256 public treasuryChangeTime;

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

    event TreasuryChanged(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    event TreasuryChangeScheduled(
        address indexed newTreasury,
        uint256 executeAfter
    );

    event TreasuryChangeCancelled(address indexed proposedTreasury);

    event TokensRescued(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    // ============================================================
    // ERRORS
    // ============================================================

    error ZeroAddress();
    error InvalidAmount();
    error BelowMinimumDeposit();
    error AboveMaximumDeposit();
    error InvalidPair();
    error InvalidPrice();
    error InsufficientAllocation();

    error InvalidTreasury();
    error TreasuryChangePending();
    error NoPendingTreasury();
    error TreasuryTimelockActive();
    error DeadlineExpired();
    error InvalidCommissionPool();
    error RescueNotAllowed();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @dev Supports only standard BSC-USD (BEP-20 USDT).
     *      Assumes exact token transfers without transfer fees.
     *      Swap output relies on the trusted PancakeSwap V2 router.
     *      Tokens with transfer fees or incompatible restrictions
     *      are not supported.
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
        // 1. Validate zero addresses
        if (
            _usdt == address(0) ||
            _ewc == address(0) ||
            _router == address(0) ||
            _pair == address(0) ||
            _commissionPool == address(0) ||
            _treasury == address(0)
        ) revert ZeroAddress();

        // 2. Only allow BSC-USD (USDT)
        if (_usdt != BSC_USDT) revert InvalidAmount();

        // 3. Validate deposit limits
        if (_minDeposit == 0 || _maxDeposit < _minDeposit) {
            revert InvalidAmount();
        }

        // 4. Validate contract addresses
        if (
            _router.code.length == 0 ||
            _pair.code.length == 0 ||
            _commissionPool.code.length == 0
        ) revert InvalidAmount();

        // 5. Validate commission pool
        if (
            _commissionPool == address(this) ||
            _commissionPool == _pair ||
            _commissionPool == _router ||
            _commissionPool == _usdt ||
            _commissionPool == _ewc
        ) revert InvalidCommissionPool();

        // 6. Assign contracts
        usdt = IERC20(_usdt);
        ewc = IERC20(_ewc);

        pancakeRouter = IPancakeRouterV2(_router);
        pancakePair = IPancakePairV2(_pair);
        commissionPool = IEWCCommissionPool(_commissionPool);

        // 7. Validate treasury
        _validateTreasury(_treasury);

        treasury = _treasury;

        emit TreasuryChanged(address(0), _treasury);

        minDeposit = _minDeposit;
        maxDeposit = _maxDeposit;

        // 8. Validate USDT decimals
        uint8 decimals = IERC20Metadata(_usdt).decimals();

        if (decimals > 18) revert InvalidAmount();

        usdtDecimals = decimals;

        // 9. Verify pair contains EWC and USDT
        address token0 = pancakePair.token0();
        address token1 = pancakePair.token1();

        bool validPair = (token0 == _ewc && token1 == _usdt) ||
            (token0 == _usdt && token1 == _ewc);

        if (!validPair) revert InvalidPair();

        // 10. Verify router factory matches configured pair
        address factory = pancakeRouter.factory();

        if (factory.code.length == 0) revert InvalidPair();

        address factoryPair = IPancakeFactoryV2(factory).getPair(_usdt, _ewc);

        if (factoryPair != _pair) revert InvalidPair();
    }

    // ============================================================
    // DEPOSIT FUNCTIONS
    // ============================================================

    /**
     * @notice Deposits USDT for the caller.
     * @param usdtAmount Amount of USDT in token units.
     * @param minEwcOut Minimum EWC received from the market purchase.
     * @param minAllocatedEWC Minimum acceptable EWC allocation.
     * @param deadline Transaction expiration timestamp.
     */

    function deposit(
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        _deposit(
            msg.sender,
            msg.sender,
            usdtAmount,
            minEwcOut,
            minAllocatedEWC,
            deadline
        );
    }

    /**
     * @notice Deposits USDT on behalf of another user.
     * @dev Permissionless to support assisted account activation.
     *      The actual payer is recorded separately.
     * @param beneficiary Address receiving the allocation.
     * @param usdtAmount Amount of USDT in token units.
     * @param minEwcOut Minimum EWC received from the market purchase.
     * @param minAllocatedEWC Minimum acceptable EWC allocation.
     * @param deadline Transaction expiration timestamp.
     */

    function depositFor(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        if (beneficiary == address(0)) revert ZeroAddress();

        _deposit(
            msg.sender,
            beneficiary,
            usdtAmount,
            minEwcOut,
            minAllocatedEWC,
            deadline
        );
    }

    /**
     * @dev Processes a USDT deposit and records the
     *      beneficiary's calculated EWC allocation.
     *
     * The allocation is an accounting record and does
     * not represent EWC held in custody for the user.
     *
     * No tokens become directly claimable from this
     * contract after depositing.
     *
     * Reward calculations and payments are handled
     * externally through a Merkle-based payout system.
     */
    function _deposit(
        address payer,
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 minAllocatedEWC,
        uint256 deadline
    ) internal {
        // Checks
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (usdtAmount < minDeposit) revert BelowMinimumDeposit();
        if (usdtAmount > maxDeposit) revert AboveMaximumDeposit();

        if (minEwcOut == 0 || minAllocatedEWC == 0) {
            revert InvalidAmount();
        }

        // Calculate allocation
        uint256 allocatedEWC = _calculateEwcFromUSDT(usdtAmount);
        uint256 allocationPrice = getCurrentEwcPrice();

        if (allocatedEWC < minAllocatedEWC) {
            revert InsufficientAllocation();
        }

        // Calculate fund distribution
        uint256 marketBuyUSDT = (usdtAmount * EWC_PURCHASE_BPS) / BPS;
        uint256 commissionUSDT = (usdtAmount * COMMISSION_BPS) / BPS;
        uint256 treasuryUSDT = usdtAmount - marketBuyUSDT - commissionUSDT;

        // Effects: update beneficiary accounting
        User storage u = users[beneficiary];

        if (u.depositCount == 0) {
            u.firstDepositTime = block.timestamp;
            totalUsers++;
        }

        u.totalDepositedUSDT += usdtAmount;
        u.totalAllocatedEWC += allocatedEWC;
        u.depositCount++;
        u.lastDepositTime = block.timestamp;

        // Effects: update global accounting
        totalDepositedUSDT += usdtAmount;
        totalAllocatedEWC += allocatedEWC;
        totalMarketBuyUSDT += marketBuyUSDT;
        totalCommissionUSDTAllocated += commissionUSDT;
        totalTreasuryUSDTAllocated += treasuryUSDT;

        // Interactions: collect and distribute USDT
        usdt.safeTransferFrom(payer, address(this), usdtAmount);

        usdt.safeTransfer(address(commissionPool), commissionUSDT);
        usdt.safeTransfer(treasury, treasuryUSDT);

        // Buy EWC using 20% of the deposit
        uint256 marketBoughtEWC = _buyEwc(
            beneficiary,
            marketBuyUSDT,
            minEwcOut,
            deadline
        );

        // Update values known only after the swap
        u.totalMarketBoughtEWC += marketBoughtEWC;
        totalMarketBoughtEWC += marketBoughtEWC;

        // Save on-chain deposit history
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
     * @dev Uses 20% of deposited USDT to purchase EWC
     *      through PancakeSwap.
     *
     * Purchased EWC is forwarded to the commission pool.
     *
     * The purchased tokens are not transferred to
     * the depositor and are not reserved for direct
     * withdrawal through this contract.
     */
    function _buyEwc(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut,
        uint256 deadline
    ) internal returns (uint256 ewcReceived) {
        usdt.forceApprove(address(pancakeRouter), usdtAmount);

        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(ewc);

        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            usdtAmount,
            minEwcOut,
            path,
            address(this),
            deadline
        );

        ewcReceived = amounts[amounts.length - 1];

        ewc.safeTransfer(address(commissionPool), ewcReceived);
        return ewcReceived;
    }

    // ============================================================
    // EWC ALLOCATION CALCULATION
    // ============================================================

    function _getEwcUsdtReserves()
        internal
        view
        returns (uint256 ewcReserve, uint256 usdtReserve)
    {
        (uint112 reserve0, uint112 reserve1, ) = pancakePair.getReserves();

        if (pancakePair.token0() == address(ewc)) {
            ewcReserve = uint256(reserve0);
            usdtReserve = uint256(reserve1);
        } else {
            ewcReserve = uint256(reserve1);
            usdtReserve = uint256(reserve0);
        }

        if (ewcReserve == 0 || usdtReserve == 0) {
            revert InvalidPrice();
        }
    }

    /**
     * @dev Calculates EWC allocation from the full USDT deposit.
     *      Allocation is accounting-only; no EWC is immediately
     *      transferred or made claimable.
     */
    function _calculateEwcFromUSDT(
        uint256 usdtAmount
    ) internal view returns (uint256) {
        (uint256 ewcReserve, uint256 usdtReserve) = _getEwcUsdtReserves();

        return Math.mulDiv(usdtAmount, ewcReserve, usdtReserve);
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
        allocatedEWC = _calculateEwcFromUSDT(usdtAmount);
        ewcPrice = getCurrentEwcPrice();
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
            (usdtReserveAmount * PRICE_CALCULATION_SCALE) /
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

    function _validateTreasury(address newTreasury) internal view {
        if (
            newTreasury == address(0) ||
            newTreasury == address(this) ||
            newTreasury == address(usdt) ||
            newTreasury == address(ewc) ||
            newTreasury == address(pancakeRouter) ||
            newTreasury == address(pancakePair) ||
            newTreasury == address(commissionPool)
        ) revert InvalidTreasury();
    }

    // Step 1: Schedule treasury change
    function setTreasury(address newTreasury) external onlyOwner {
        _validateTreasury(newTreasury);

        if (newTreasury == treasury) revert InvalidTreasury();
        if (treasuryChangeTime != 0) revert TreasuryChangePending();

        pendingTreasury = newTreasury;
        treasuryChangeTime = block.timestamp + TREASURY_CHANGE_DELAY;

        emit TreasuryChangeScheduled(newTreasury, treasuryChangeTime);
    }

    // Step 2: Execute after 48 hours
    function executeTreasuryChange() external {
        if (treasuryChangeTime == 0) revert NoPendingTreasury();

        if (block.timestamp < treasuryChangeTime) {
            revert TreasuryTimelockActive();
        }

        address newTreasury = pendingTreasury;

        _validateTreasury(newTreasury);

        address oldTreasury = treasury;

        delete pendingTreasury;
        delete treasuryChangeTime;

        treasury = newTreasury;

        emit TreasuryChanged(oldTreasury, newTreasury);
    }

    // Cancel a scheduled change
    function cancelTreasuryChange() external onlyOwner {
        if (treasuryChangeTime == 0) revert NoPendingTreasury();

        address proposedTreasury = pendingTreasury;

        delete pendingTreasury;
        delete treasuryChangeTime;

        emit TreasuryChangeCancelled(proposedTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function rescueTokens(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (token == address(0) || recipient == address(0)) {
            revert ZeroAddress();
        }

        if (
            token == address(usdt) ||
            token == address(ewc) ||
            token.code.length == 0
        ) revert RescueNotAllowed();

        if (amount == 0) revert InvalidAmount();

        IERC20(token).safeTransfer(recipient, amount);

        emit TokensRescued(token, recipient, amount);
    }
}
