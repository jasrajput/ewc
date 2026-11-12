
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IPancakeFactory {
    function INIT_CODE_PAIR_HASH() external view returns (bytes32);
    function getPair(address tokenA, address tokenB) external view returns (address);
}

/**
 * @title Elevate World Community (EWC)
 * @notice Fixed-supply BEP-20 token for BNB Smart Chain.
 *
 * Supply: 500,000,000 EWC
 * Decimals: 18
 *
 * Features:
 * - Fixed supply with no additional minting
 * - Public buying enabled manually after unlockTime
 * - Temporary launch protection
 * - Investment contract exemption
 * - Same-block buy/sell protection
 * - Protection propagation through wallet transfers
 * - No taxes, blacklist, or pause functionality
 */
contract EWCToken is ERC20 {

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    uint256 public constant INITIAL_SUPPLY = 500_000_000 ether;

    address public owner;
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
    event OwnershipRenounced(address indexed previousOwner);

    // ============================================================
    // ERRORS
    // ============================================================

    error NotOwner();
    error UnlockTimeInPast();
    error InvalidDexParams();
    error InvalidPairInitCodeHash();
    error TooEarly(uint256 unlockAvailableAt);
    error AlreadyEnabled();
    error ZeroAddress();
    error BuyingNotEnabled();
    error MaxBuyExceeded(uint256 amount, uint256 limit);
    error SameBlockBuy();
    error SameBlockSell();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _unlockTime Earliest timestamp for enabling public buying.
     * @param _shieldDuration Launch protection duration in seconds.
     * @param _maxBuyAmount Maximum EWC per buy during shield (0 = unlimited).
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
    ) ERC20("Elevate World Community", "EWC") {

        if (_unlockTime <= block.timestamp) revert UnlockTimeInPast();

        if (
            _dexFactory == address(0) ||
            _quoteToken == address(0) ||
            _pairInitCodeHash == bytes32(0)
        ) revert InvalidDexParams();

        // Verify the initialization hash against the factory.
        if (IPancakeFactory(_dexFactory).INIT_CODE_PAIR_HASH() != _pairInitCodeHash) {
            revert InvalidPairInitCodeHash();
        }

        owner = msg.sender;
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
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============================================================
    // OWNER FUNCTIONS
    // ============================================================

    /**
     * @notice Enables public buying permanently after unlockTime.
     */
    function enableBuying() external onlyOwner {
        if (block.timestamp < unlockTime) revert TooEarly(unlockTime);
        if (buyingEnabledAt != 0) revert AlreadyEnabled();

        buyingEnabledAt = block.timestamp;
        emit BuyingEnabled(msg.sender, block.timestamp);
    }

    /**
     * @notice Sets the official investment contract.
     * @dev The investment contract can buy before public launch
     *      and is exempt from same-block sell restrictions.
     */
    function setInvestContract(address newInvestContract) external onlyOwner {
        if (newInvestContract == address(0)) revert ZeroAddress();

        address previous = investContract;
        investContract = newInvestContract;

        emit InvestContractSet(previous, newInvestContract);
    }

    /**
     * @notice Permanently removes ownership.
     * @dev Ensure buying is enabled and the investment contract
     *      is configured before renouncing.
     */
    function renounceOwnership() external onlyOwner {
        address previousOwner = owner;
        owner = address(0);

        emit OwnershipRenounced(previousOwner);
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    function buyingEnabled() public view returns (bool) {
        return buyingEnabledAt != 0;
    }

    function shieldEndTime() public view returns (uint256) {
        if (buyingEnabledAt == 0) return 0;
        return buyingEnabledAt + shieldDuration;
    }

    function shieldActive() public view returns (bool) {
        return buyingEnabledAt != 0 &&
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
        if (wallet == investContract) return false;
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
     * Rules:
     * 1. Public buys are blocked until enableBuying().
     * 2. Investment contract buys are exempt.
     * 3. During the shield, one buy per wallet per block.
     * 4. During the shield, optional maximum amount per buy.
     * 5. Buying and selling in the same block is blocked.
     * 6. Investment distributions protect the recipient.
     * 7. Protected wallets propagate restrictions via transfers.
     * 8. Investment contract sells are exempt.
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

        bool buy = from == dexPair;
        bool sell = to == dexPair;
        bool protectedSender = lastProtectedReceiveBlock[from] == block.number;

        // --------------------------------------------------------
        // PUBLIC BUY RESTRICTIONS
        // --------------------------------------------------------

        if (buy && to != investContract) {
            uint256 enabledAt = buyingEnabledAt;

            if (enabledAt == 0) revert BuyingNotEnabled();

            if (block.timestamp < enabledAt + shieldDuration) {
                if (_lastBuyBlock[to] == block.number) revert SameBlockBuy();

                if (maxBuyAmount > 0 && value > maxBuyAmount) {
                    revert MaxBuyExceeded(value, maxBuyAmount);
                }

                _lastBuyBlock[to] = block.number;
            }
        }

        // --------------------------------------------------------
        // SAME-BLOCK SELL PROTECTION
        // --------------------------------------------------------

        if (sell && from != investContract && protectedSender) {
            revert SameBlockSell();
        }

        // --------------------------------------------------------
        // EXECUTE ERC20 TRANSFER
        // --------------------------------------------------------

        super._update(from, to, value);

        // --------------------------------------------------------
        // PROTECT PUBLIC BUY RECIPIENT
        // --------------------------------------------------------

        if (buy && to != investContract) {
            lastProtectedReceiveBlock[to] = block.number;
            return;
        }

        // --------------------------------------------------------
        // PROTECT INVESTMENT DISTRIBUTION RECIPIENT
        // --------------------------------------------------------

        if (
            investContract != address(0) &&
            from == investContract &&
            to != address(0) &&
            to != dexPair &&
            to != investContract
        ) {
            lastProtectedReceiveBlock[to] = block.number;
            return;
        }

        // --------------------------------------------------------
        // PROPAGATE SAME-BLOCK PROTECTION
        // --------------------------------------------------------

        if (
            protectedSender &&
            value > 0 &&
            to != address(0) &&
            to != dexPair &&
            to != investContract
        ) {
            lastProtectedReceiveBlock[to] = block.number;
        }
    }
}
