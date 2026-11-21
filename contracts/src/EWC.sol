// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IPancakeFactory {
    function INIT_CODE_PAIR_HASH() external view returns (bytes32);
}

/**
 * @title Elevate World Community (EWC)
 * @notice Fixed-supply BEP-20 token on BNB Smart Chain.
 *
 * Supply: 500,000,000 EWC
 * Decimals: 18
 *
 * Launch Protection:
 * - Restrictions apply only to the official PancakeSwap V2
 *   EWC/USDT pair stored in dexPair.
 * - Other DEX pools may bypass launch protections.
 * - Public buying requires activation after unlockTime.
 * - During the shield, buy limits apply per wallet and transfer.
 * - Same-block sell protection applies to marked wallets only.
 * - Multi-wallet trading and MEV attacks remain possible.
 * - Liquidity withdrawals are restricted before and during launch.
 * - Same-block restrictions expire when the shield ends.
 *
 * Investment Contract:
 * - Can be registered only once before public buying is enabled.
 * - Registered investment contract has special trading exemptions.
 *
 * Ownership:
 * - Supports two-step ownership transfers via Ownable2Step.
 * - Public buying has an owner-controlled launch and timed fallback.
 * - Ownership cannot be renounced before launch requirements are met.
 *
 * No taxes, blacklist or pause functionality.
 */

contract EWCToken is ERC20, Ownable2Step {
    // ============================================================
    // STATE VARIABLES
    // ============================================================

    uint256 public constant INITIAL_SUPPLY = 500_000_000 ether;
    uint256 public constant PUBLIC_LAUNCH_DELAY = 1 days;

    // Constructor safety limits
    uint256 public constant MAX_UNLOCK_DELAY = 30 days;
    uint256 public constant MAX_SHIELD_DURATION = 3 days;
    uint256 public constant MIN_BUY_LIMIT = INITIAL_SUPPLY / 10_000; // 0.01%
    uint256 public constant MAX_BUY_LIMIT = INITIAL_SUPPLY / 20; // 5%

    address public investContract;

    uint256 public immutable unlockTime;
    uint256 public immutable shieldDuration;
    uint256 public immutable maxBuyAmount;

    address public immutable dexPair;

    uint256 public buyingEnabledAt;

    mapping(address => uint256) public lastProtectedReceiveBlock;
    mapping(address => uint256) private _lastBuyBlock;

    // ============================================================
    // EVENTS
    // ============================================================

    event BuyingEnabled(address indexed by, uint256 timestamp);
    event InvestContractSet(address indexed previous, address indexed current);

    // ============================================================
    // ERRORS
    // ============================================================

    error InvalidDexParams();
    error InvalidPairInitCodeHash();
    error TooEarly(uint256 unlockAvailableAt);
    error AlreadyEnabled();
    error BuyingNotEnabled();
    error MaxBuyExceeded(uint256 amount, uint256 limit);
    error SameBlockBuy();
    error SameBlockSell();
    error InvestContractAlreadySet();
    error InvalidInvestContract();
    error InvestContractNotSet();
    error InvalidUnlockTime();
    error InvalidShieldDuration();
    error InvalidMaxBuyAmount();
    error SellingNotEnabled();
    error TransferToTokenContract();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _unlockTime Unix timestamp within the next 30 days.
     * @param _shieldDuration Launch shield duration (1 second to 3 days).
     * @param _maxBuyAmount Buy limit in wei (0 = unlimited,
     *        otherwise 0.01% to 5% of supply).
     * @param _dexFactory PancakeSwap V2 factory address.
     * @param _quoteToken Quote token address (USDT).
     * @param _pairInitCodeHash PancakeSwap V2 pair initialization hash.
     */

    constructor(
        uint256 _unlockTime,
        uint256 _shieldDuration,
        uint256 _maxBuyAmount,
        address _dexFactory,
        address _quoteToken,
        bytes32 _pairInitCodeHash
    ) ERC20("Elevate World Community", "EWC") Ownable(msg.sender) {
        // Unlock must be in the future, within 30 days.
        if (
            _unlockTime <= block.timestamp ||
            _unlockTime - block.timestamp > MAX_UNLOCK_DELAY
        ) {
            revert InvalidUnlockTime();
        }

        // Shield cannot be disabled or exceed 3 days.
        if (_shieldDuration == 0 || _shieldDuration > MAX_SHIELD_DURATION) {
            revert InvalidShieldDuration();
        }

        // Zero means unlimited buying.
        // Otherwise enforce 0.01% - 5% of total supply.
        if (
            _maxBuyAmount != 0 &&
            (_maxBuyAmount < MIN_BUY_LIMIT || _maxBuyAmount > MAX_BUY_LIMIT)
        ) {
            revert InvalidMaxBuyAmount();
        }

        // Validate DEX configuration.
        if (
            _dexFactory == address(0) ||
            _quoteToken == address(0) ||
            _pairInitCodeHash == bytes32(0)
        ) {
            revert InvalidDexParams();
        }

        // Verify factory initialization hash.
        if (
            IPancakeFactory(_dexFactory).INIT_CODE_PAIR_HASH() !=
            _pairInitCodeHash
        ) {
            revert InvalidPairInitCodeHash();
        }

        unlockTime = _unlockTime;
        shieldDuration = _shieldDuration;
        maxBuyAmount = _maxBuyAmount;

        dexPair = _computePair(
            address(this),
            _quoteToken,
            _dexFactory,
            _pairInitCodeHash
        );

        _mint(msg.sender, INITIAL_SUPPLY);
    }

    // ============================================================
    // OWNER FUNCTIONS
    // ============================================================

    /**
     * @notice Enables public buying permanently after unlockTime.
     */

    function enableBuying() external {
        if (buyingEnabledAt != 0) {
            revert AlreadyEnabled();
        }

        // Investment contract must be configured first.
        if (investContract == address(0)) {
            revert InvestContractNotSet();
        }

        // Nobody can launch before unlockTime.
        if (block.timestamp < unlockTime) {
            revert TooEarly(unlockTime);
        }

        // Owner can launch anytime after unlockTime.
        // Other addresses can launch after the fallback delay.
        if (
            msg.sender != owner() &&
            block.timestamp < unlockTime + PUBLIC_LAUNCH_DELAY
        ) {
            revert TooEarly(unlockTime + PUBLIC_LAUNCH_DELAY);
        }

        buyingEnabledAt = block.timestamp;

        emit BuyingEnabled(msg.sender, block.timestamp);
    }

    /**
     * @notice Sets the official investment contract.
     * @dev The investment contract can buy before public launch
     *      and is exempt from same-block sell restrictions.
     */
    function setInvestContract(address newInvestContract) external onlyOwner {
        // Cannot configure after public buying is enabled
        if (buyingEnabledAt != 0) {
            revert AlreadyEnabled();
        }

        // Can only be configured once.
        if (investContract != address(0)) {
            revert InvestContractAlreadySet();
        }

        // Reject invalid addresses.
        if (
            newInvestContract == address(0) ||
            newInvestContract == address(this) ||
            newInvestContract == dexPair
        ) {
            revert InvalidInvestContract();
        }

        // Register investment contract permanently.
        investContract = newInvestContract;

        emit InvestContractSet(address(0), newInvestContract);
    }

    /**
     * @notice Permanently renounces ownership.
     * @dev Requires public buying enabled and investment contract set.
     */
    function renounceOwnership() public override onlyOwner {
        if (buyingEnabledAt == 0) {
            revert BuyingNotEnabled();
        }

        if (investContract == address(0)) {
            revert InvestContractNotSet();
        }

        super.renounceOwnership();
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    function getOwner() external view returns (address) {
        return owner();
    }

    /// @notice Returns whether public buying has been enabled.
    function buyingEnabled() public view returns (bool) {
        return buyingEnabledAt != 0;
    }

    /// @notice Returns the timestamp when launch protection expires.
    function shieldEndTime() public view returns (uint256) {
        if (buyingEnabledAt == 0) return 0;
        return buyingEnabledAt + shieldDuration;
    }

    /// @notice Returns whether launch protection is currently active.
    function shieldActive() public view returns (bool) {
        return
            buyingEnabledAt != 0 &&
            block.timestamp < buyingEnabledAt + shieldDuration;
    }

    function timeUntilUnlockEligible() external view returns (uint256) {
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    function isBuy(address from) public view returns (bool) {
        return from == dexPair;
    }

    function isSell(address to) public view returns (bool) {
        return to == dexPair;
    }

    function lastBuyBlock(address wallet) external view returns (uint256) {
        return _lastBuyBlock[wallet];
    }

    function isSellProtected(address wallet) external view returns (bool) {
        if (!shieldActive() || wallet == investContract) {
            return false;
        }

        return lastProtectedReceiveBlock[wallet] == block.number;
    }

    // ============================================================
    // DEX PAIR CALCULATION
    // ============================================================

    /**
     * @dev Computes the PancakeSwap V2 pair address using CREATE2.
     */
    function _computePair(
        address tokenA,
        address tokenB,
        address factory,
        bytes32 initCodeHash
    ) private pure returns (address) {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));

        bytes32 pairHash = keccak256(
            abi.encodePacked(hex"ff", factory, salt, initCodeHash)
        );

        return address(uint160(uint256(pairHash)));
    }

    // ============================================================
    // ERC20 TRANSFER LOGIC
    // ============================================================

    /**
     * @dev Applies launch and same-block trading restrictions.
     *
     * Launch protection:
     * 1. Applies only to the official PancakeSwap V2 EWC/USDT pair.
     * 2. Other pools can bypass pool-specific restrictions.
     * 3. Public buys require enableBuying(); investment buys are exempt.
     * 4. During the shield, one buy per recipient per block.
     * 5. Maximum buy amount applies per transfer, not per user.
     * 6. Protected wallets cannot sell in the same block.
     * 7. Investment distributions and transfers propagate protection.
     * 8. Investment contract sells are exempt.
     * 9. Zero-value transfers do not trigger protection bookkeeping.
     * 10. Same-block restrictions expire with the shield.
     *
     * Limitations:
     * - Multi-wallet bots, MEV and sandwich attacks remain possible.
     * - Shared executors, zaps and flash swaps may fail during the shield.
     * - Liquidity withdrawals count as buys and are restricted
     *   before launch and during the shield.
     */

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Initial supply mint.
        if (from == address(0)) {
            super._update(from, to, value);
            return;
        }

        // Prevent EWC from being locked in its own contract.
        if (to == address(this) && value > 0) {
            revert TransferToTokenContract();
        }

        bool buy = from == dexPair;
        bool sell = to == dexPair;

        // Block pre-launch sells; allow owner to add liquidity.
        if (sell && buyingEnabledAt == 0 && from != owner() && value > 0) {
            revert SellingNotEnabled();
        }

        // Block public buys before launch.
        if (buy && to != investContract && buyingEnabledAt == 0) {
            revert BuyingNotEnabled();
        }

        // Zero-value transfers do not trigger protection.
        if (value == 0) {
            super._update(from, to, value);
            return;
        }

        // Same-block restrictions apply only during the shield.
        if (!shieldActive()) {
            super._update(from, to, value);
            return;
        }

        bool protectedSender = lastProtectedReceiveBlock[from] == block.number;

        // ----------------------------------------------------
        // PUBLIC BUY RESTRICTIONS
        // ----------------------------------------------------

        if (buy && to != investContract) {
            if (_lastBuyBlock[to] == block.number) {
                revert SameBlockBuy();
            }

            if (maxBuyAmount > 0 && value > maxBuyAmount) {
                revert MaxBuyExceeded(value, maxBuyAmount);
            }

            _lastBuyBlock[to] = block.number;
        }

        // ----------------------------------------------------
        // SAME-BLOCK SELL PROTECTION
        // ----------------------------------------------------

        if (sell && from != investContract && protectedSender) {
            revert SameBlockSell();
        }

        // ----------------------------------------------------
        // EXECUTE ERC20 TRANSFER
        // ----------------------------------------------------

        super._update(from, to, value);

        // ----------------------------------------------------
        // PROTECT PUBLIC BUY RECIPIENT
        // ----------------------------------------------------

        if (buy && to != investContract) {
            lastProtectedReceiveBlock[to] = block.number;
            return;
        }

        // ----------------------------------------------------
        // PROTECT INVESTMENT DISTRIBUTION RECIPIENT
        // ----------------------------------------------------

        if (from == investContract && to != dexPair && to != investContract) {
            lastProtectedReceiveBlock[to] = block.number;
            return;
        }

        // ----------------------------------------------------
        // PROPAGATE SAME-BLOCK PROTECTION
        // ----------------------------------------------------

        if (protectedSender && to != dexPair && to != investContract) {
            lastProtectedReceiveBlock[to] = block.number;
        }
    }
}
