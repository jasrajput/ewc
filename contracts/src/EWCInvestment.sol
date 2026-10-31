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

contract EWCInvestment is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    // CONSTANTS
    // =============================================================

    uint256 public constant BPS = 10_000;

    // 20% -> PancakeSwap market buy
    uint256 public constant EWC_PURCHASE_BPS = 2_000;

    // 40% -> Direct + Rank + Salary reserve
    uint256 public constant COMMISSION_BPS = 4_000;

    // Remaining 40% -> Treasury
    uint256 public constant TREASURY_BPS = 4_000;

    uint256 public constant DEPOSIT_COOLDOWN = 3 seconds;

    // =============================================================
    // EXTERNAL CONTRACTS
    // =============================================================

    IERC20 public immutable usdt;
    IERC20 public immutable ewc;

    IPancakeRouterV2 public immutable pancakeRouter;
    IPancakePairV2 public immutable pancakePair;

    IEWCCommissionPool public immutable commissionPool;

    // EWC is fixed at 18 decimals.
    // We only need to read USDT decimals.
    uint8 public immutable usdtDecimals;

    // =============================================================
    // ADMIN
    // =============================================================

    address public treasury;

    // =============================================================
    // DEPOSIT CONFIG
    // =============================================================

    uint256 public immutable minDeposit;
    uint256 public immutable maxDeposit;

    // =============================================================
    // USER DATA
    // =============================================================

    struct User {
        // Full 100% USDT invested.
        uint256 totalDepositedUSDT;
        // User's EWC allocation calculated from full 100% investment.
        uint256 totalAllocatedEWC;
        // Actual EWC bought by protocol using the 20% portion.
        // This is NOT the user's allocation.
        uint256 totalMarketBoughtEWC;
        uint256 depositCount;
        uint256 firstDepositTime;
        uint256 lastDepositTime;
    }

    struct Deposit {
        address payer;
        // Full 100% USDT investment.
        uint256 usdtAmount;
        // EWC price BEFORE our 20% market buy.
        // 18-decimal USDT price of 1 EWC.
        uint256 allocationPrice;
        // User's EWC allocation based on full investment.
        uint256 allocatedEWC;
        // Protocol fund routing.
        uint256 marketBuyUSDT;
        uint256 marketBoughtEWC;
        uint256 commissionUSDT;
        uint256 treasuryUSDT;
        uint256 timestamp;
    }

    mapping(address => User) public users;

    mapping(address => Deposit[]) private _deposits;

    // =============================================================
    // GLOBAL STATS
    // =============================================================

    uint256 public totalUsers;

    // Timestamp of the latest successful deposit across all users
    uint256 public lastGlobalDepositTime;

    // Full investments.
    uint256 public totalDepositedUSDT;

    // User allocation based on full investments.
    uint256 public totalAllocatedEWC;

    // Protocol 20% market-buy accounting.
    uint256 public totalMarketBuyUSDT;
    uint256 public totalMarketBoughtEWC;

    // 40 / 40 routing.
    uint256 public totalCommissionUSDTAllocated;
    uint256 public totalTreasuryUSDTAllocated;

    // =============================================================
    // EVENTS
    // =============================================================

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

    // =============================================================
    // ERRORS
    // =============================================================

    error ZeroAddress();
    error InvalidAmount();

    error BelowMinimumDeposit();
    error AboveMaximumDeposit();
    error DepositCooldownActive();

    error InvalidPair();
    error InvalidPrice();
    error InsufficientSwapOutput();

    // =============================================================
    // MODIFIERS
    // =============================================================

    // =============================================================
    // CONSTRUCTOR
    // =============================================================

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
        ) {
            revert ZeroAddress();
        }

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

        if (!validPair) {
            revert InvalidPair();
        }
    }

    // =============================================================
    // DEPOSIT
    // =============================================================

    function deposit(
        uint256 usdtAmount,
        uint256 minEwcOut
    ) external nonReentrant {
        _deposit(msg.sender, msg.sender, usdtAmount, minEwcOut);
    }

    function depositFor(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut
    ) external nonReentrant {
        if (beneficiary == address(0)) {
            revert ZeroAddress();
        }

        _deposit(msg.sender, beneficiary, usdtAmount, minEwcOut);
    }

    function _deposit(
        address payer,
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut
    ) internal {
        if (block.timestamp < lastGlobalDepositTime + DEPOSIT_COOLDOWN) {
            revert DepositCooldownActive();
        }
        if (usdtAmount < minDeposit) revert BelowMinimumDeposit();
        if (usdtAmount > maxDeposit) revert AboveMaximumDeposit();

        // The full USDT amount determines the beneficiary's EWC allocation.
        // The 20% market buy is a separate protocol purchase.
        uint256 allocationPrice = getCurrentEwcPrice();
        if (allocationPrice == 0) revert InvalidPrice();
        uint256 allocatedEWC = _calculateEwcFromUSDT(usdtAmount, allocationPrice);

        uint256 marketBuyUSDT = (usdtAmount * EWC_PURCHASE_BPS) / BPS;
        uint256 commissionUSDT = (usdtAmount * COMMISSION_BPS) / BPS;
        uint256 treasuryUSDT = usdtAmount - marketBuyUSDT - commissionUSDT;

        usdt.safeTransferFrom(payer, address(this), usdtAmount);
        usdt.safeTransfer(address(commissionPool), commissionUSDT);
        usdt.safeTransfer(treasury, treasuryUSDT);
        uint256 marketBoughtEWC = _buyEwc(beneficiary, marketBuyUSDT, minEwcOut);

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

        totalDepositedUSDT += usdtAmount;
        totalAllocatedEWC += allocatedEWC;
        totalMarketBuyUSDT += marketBuyUSDT;
        totalMarketBoughtEWC += marketBoughtEWC;
        totalCommissionUSDTAllocated += commissionUSDT;
        totalTreasuryUSDTAllocated += treasuryUSDT;
        lastGlobalDepositTime = block.timestamp;

        _deposits[beneficiary].push(Deposit({
            payer: payer,
            usdtAmount: usdtAmount,
            allocationPrice: allocationPrice,
            allocatedEWC: allocatedEWC,
            marketBuyUSDT: marketBuyUSDT,
            marketBoughtEWC: marketBoughtEWC,
            commissionUSDT: commissionUSDT,
            treasuryUSDT: treasuryUSDT,
            timestamp: block.timestamp
        }));

        emit Deposited(
            payer, beneficiary, usdtAmount, allocationPrice, allocatedEWC,
            marketBuyUSDT, marketBoughtEWC, commissionUSDT, treasuryUSDT,
            block.timestamp
        );
    }

    // =============================================================
    // 20% PANCAKESWAP MARKET BUY
    // =============================================================

    function _buyEwc(
        address beneficiary,
        uint256 usdtAmount,
        uint256 minEwcOut
    ) internal returns (uint256 ewcReceived) {
        if (usdtAmount == 0) {
            revert InvalidAmount();
        }

        usdt.forceApprove(address(pancakeRouter), usdtAmount);

        address[] memory path = new address[](2);

        path[0] = address(usdt);
        path[1] = address(ewc);

        /*
            EWC has no transfer tax / burn.

            So normal PancakeSwap V2
            swapExactTokensForTokens() is enough.
        */

        uint256[] memory amounts = pancakeRouter.swapExactTokensForTokens(
            usdtAmount,
            minEwcOut,
            path,
            address(commissionPool),
            block.timestamp + 300
        );

        ewcReceived = amounts[amounts.length - 1];

        if (ewcReceived == 0) {
            revert InsufficientSwapOutput();
        }

        /*
            IMPORTANT:

            This EWC was bought using the protocol's
            20% market-buy portion.

            It is NOT the user's investment allocation.

            Example:

                User paid              1,000 USDT
                Allocation price       $0.05

                User allocation        20,000 EWC

                Protocol market buy       200 USDT
                Actual EWC bought       ~4,000 EWC

            20,000 EWC:
                user's investment allocation.

            ~4,000 EWC:
                actual protocol market purchase.

            The purchased EWC is delivered to the commission pool.
        */

        emit EWCPurchased(
            beneficiary,
            usdtAmount,
            ewcReceived,
            block.timestamp
        );

        return ewcReceived;
    }

    // =============================================================
    // EWC ALLOCATION CALCULATION
    // =============================================================

    /*
        ewcPrice uses 18 decimals.

        EWC itself uses 18 decimals.

        Example:

            USDT has 18 decimals:

                usdtAmount = 1000e18
                ewcPrice   = 0.05e18

                result = 20,000e18 EWC

        If USDT uses a different decimal count,
        it is normalized first.
    */

    function _calculateEwcFromUSDT(
        uint256 usdtAmount,
        uint256 ewcPrice
    ) internal view returns (uint256) {
        if (ewcPrice == 0) {
            revert InvalidPrice();
        }

        uint256 normalizedUSDT = (usdtAmount * 1e18) /
            (10 ** uint256(usdtDecimals));

        return (normalizedUSDT * 1e18) / ewcPrice;
    }

    // =============================================================
    // FRONTEND ALLOCATION PREVIEW
    // =============================================================

    /*
        Use this before deposit to display:

            Investment Amount
            Current EWC Price
            EWC Allocation

        Allocation is based on FULL investment amount.
    */

    function previewEwcAllocation(
        uint256 usdtAmount
    ) external view returns (uint256 ewcPrice, uint256 allocatedEWC) {
        ewcPrice = getCurrentEwcPrice();

        if (ewcPrice == 0) {
            return (0, 0);
        }

        allocatedEWC = _calculateEwcFromUSDT(usdtAmount, ewcPrice);
    }

    // =============================================================
    // FUND ROUTING PREVIEW
    // =============================================================

    /*
        This is PROTOCOL fund routing.

        It does NOT represent the user's
        investment allocation.
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

    // =============================================================
    // CURRENT EWC PRICE
    // =============================================================

    /*
        Current PancakeSwap V2 spot price.

        Returns:

            USDT price of 1 EWC

        with 18 decimal precision.

        Example:

            $0.05

        returns:

            50000000000000000

        This is a SPOT PRICE.

        It is NOT a TWAP/oracle.
    */

    function getCurrentEwcPrice() public view returns (uint256) {
        (uint112 reserve0, uint112 reserve1, ) = pancakePair.getReserves();

        if (reserve0 == 0 || reserve1 == 0) {
            return 0;
        }

        uint256 ewcReserve;
        uint256 usdtReserveAmount;

        if (pancakePair.token0() == address(ewc)) {
            ewcReserve = uint256(reserve0);

            usdtReserveAmount = uint256(reserve1);
        } else {
            ewcReserve = uint256(reserve1);

            usdtReserveAmount = uint256(reserve0);
        }

        /*
            EWC = 18 decimals.

            Formula normalizes USDT decimals and
            returns USDT/EWC with 18 decimals.
        */

        return
            (usdtReserveAmount * 1e36) /
            (ewcReserve * (10 ** uint256(usdtDecimals)));
    }

    // =============================================================
    // USER SUMMARY
    // =============================================================

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

    // =============================================================
    // INVESTMENT HISTORY
    // =============================================================

    function getUserDepositCount(address user) external view returns (uint256) {
        return _deposits[user].length;
    }

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

    // =============================================================
    // COMMISSION POOL BALANCES
    // =============================================================

    function getCommissionPoolBalances()
        external
        view
        returns (uint256 usdtIncomeReserve, uint256 ewcRoiReserve)
    {
        return (commissionPool.usdtReserve(), commissionPool.ewcRoiReserve());
    }

    // =============================================================
    // PROTOCOL STATS
    // =============================================================

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

    // =============================================================
    // ADMIN
    // =============================================================

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert ZeroAddress();
        }

        address oldTreasury = treasury;

        treasury = newTreasury;

        emit TreasuryChanged(oldTreasury, newTreasury);
    }


}
