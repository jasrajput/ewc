// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Elevate World Community (EWC)
 *
 * @notice Fixed-supply BEP-20 token for BNB Smart Chain.
 *
 * Token:
 *   Name:     Elevate World Community
 *   Symbol:   EWC
 *   Supply:   500,000,000 EWC
 *   Decimals: 18
 *
 * Supply:
 *   - 500,000,000 EWC minted once at deployment.
 *   - No external mint function.
 *   - No privileged minter.
 *   - Total supply cannot be increased.
 *
 * Public trading:
 *   - Wallet transfers are available immediately.
 *   - Sells to the EWC DEX pair are available immediately,
 *     subject to same-block protection.
 *   - Public buys are disabled until enableBuying().
 *
 * Launch protection:
 *   - Buying can only be enabled after unlockTime.
 *   - During shieldDuration:
 *       1. Same wallet cannot make multiple DEX buys in one block.
 *       2. Optional maximum EWC amount per buy.
 *
 * Investment contract:
 *   - Owner registers the official investment contract.
 *   - Pair -> investment contract transfers bypass public-buy
 *     restrictions.
 *   - This allows deposit() to internally swap USDT -> EWC and
 *     receive EWC at address(this).
 *   - Investment contract has NO mint authority.
 *
 * Same-block protection:
 *   - When the investment contract sends EWC to a wallet,
 *     that wallet cannot sell EWC to the DEX pair in the same block.
 *
 *   - When a normal wallet buys EWC from the DEX pair,
 *     that wallet also cannot sell back to the pair in the same block.
 *
 * Owner:
 *   - Can enable public buying once after unlockTime.
 *   - Can set/change investContract until ownership is renounced.
 *   - Can permanently renounce ownership.
 *
 * Owner cannot:
 *   - Mint tokens.
 *   - Increase supply.
 *   - Blacklist wallets.
 *   - Pause transfers.
 *   - Add taxes.
 *   - Change the DEX pair.
 *   - Change launch parameters.
 *   - Transfer ownership.
 */
contract EWCToken is ERC20 {

    // =============================================================
    // TOKEN
    // =============================================================

    uint256 public constant INITIAL_SUPPLY = 500_000_000 ether;


    // =============================================================
    // OWNER
    // =============================================================

    address public owner;


    // =============================================================
    // LAUNCH CONFIGURATION
    // =============================================================

    /// @notice Earliest timestamp at which public buying can be enabled.
    uint256 public immutable unlockTime;

    /// @notice Duration of launch protection after buying is enabled.
    uint256 public immutable shieldDuration;

    /// @notice Maximum EWC allowed per public buy during the shield.
    /// @dev Set to 0 to disable the maximum-buy restriction.
    uint256 public immutable maxBuyAmount;

    /// @notice Deterministically calculated EWC/quote-token pair.
    address public immutable dexPair;


    // =============================================================
    // INVESTMENT CONTRACT
    // =============================================================

    /**
     * @notice Official EWC investment contract.
     *
     * It may receive EWC directly from the DEX pair without being
     * subject to public-buy restrictions.
     *
     * This is required for:
     *
     * deposit()
     *     -> internal USDT -> EWC swap
     *     -> Pancake pair sends EWC to investment contract
     *
     * This address cannot mint EWC.
     */
    address public investContract;


    // =============================================================
    // TRADING STATE
    // =============================================================

    /// @notice Timestamp when public buying was enabled.
    /// @dev 0 means public buying is still disabled.
    uint256 public buyingEnabledAt;


    // =============================================================
    // SAME-BLOCK PROTECTION
    // =============================================================

    /**
     * @notice Last protected block in which an address received EWC.
     *
     * Updated when:
     *
     *   1. A normal wallet buys EWC from dexPair.
     *   2. A wallet receives EWC from investContract.
     *
     * If the wallet attempts to sell to dexPair during that same
     * block, the sell reverts.
     */
    mapping(address => uint256) public lastProtectedReceiveBlock;


    /**
     * @dev Used by the temporary launch shield to prevent multiple
     * public DEX buys by the same recipient in one block.
     */
    mapping(address => uint256) private _lastBuyBlock;


    // =============================================================
    // EVENTS
    // =============================================================

    event BuyingEnabled(
        address indexed by,
        uint256 timestamp
    );

    event InvestContractSet(
        address indexed previousInvestContract,
        address indexed newInvestContract
    );

    event OwnershipRenounced(
        address indexed previousOwner
    );


    // =============================================================
    // ERRORS
    // =============================================================

    error NotOwner();
    error UnlockTimeInPast();
    error InvalidDexParams();
    error TooEarly(uint256 unlockAvailableAt);
    error AlreadyEnabled();
    error ZeroAddress();
    error BuyingNotEnabled();
    error MaxBuyExceeded(uint256 amount, uint256 limit);
    error SameBlockBuy();
    error SameBlockSell();


    // =============================================================
    // CONSTRUCTOR
    // =============================================================

  /**
    * @param _unlockTime Earliest UNIX timestamp at which enableBuying() can be called.
    *
    * @param _shieldDuration Duration in seconds for temporary launch protection
    * after public buying is enabled.
    *
    * @param _maxBuyAmount Maximum EWC allowed per public DEX buy while the launch
    * shield is active. Must use 18-decimal token units.
    *
    * Example: 100,000 EWC = 100000 ether.
    * Set to 0 for no maximum-buy restriction.
    *
    * @param _dexFactory PancakeSwap V2 factory address.
    *
    * @param _quoteToken Quote token used for the EWC pair, normally USDT.
    *
    * @param _pairInitCodeHash V2 pair init-code hash.
    */
    constructor(
        uint256 _unlockTime,
        uint256 _shieldDuration,
        uint256 _maxBuyAmount,
        address _dexFactory,
        address _quoteToken,
        bytes32 _pairInitCodeHash
    ) ERC20("Elevate World Community", "EWC") {
        if (_unlockTime <= block.timestamp) {
            revert UnlockTimeInPast();
        }

        if (
            _dexFactory == address(0) ||
            _quoteToken == address(0) ||
            _pairInitCodeHash == bytes32(0)
        ) {
            revert InvalidDexParams();
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


    // =============================================================
    // MODIFIERS
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }

        _;
    }


    // =============================================================
    // OWNER FUNCTIONS
    // =============================================================

    /**
     * @notice Permanently enables public DEX buying.
     *
     * Can only be called:
     *
     *   - By owner.
     *   - After unlockTime.
     *   - Once.
     *
     * Once enabled, buying cannot be disabled.
     */
    function enableBuying() external onlyOwner {
        if (block.timestamp < unlockTime) {
            revert TooEarly(unlockTime);
        }

        if (buyingEnabledAt != 0) {
            revert AlreadyEnabled();
        }

        buyingEnabledAt = block.timestamp;

        emit BuyingEnabled(msg.sender, block.timestamp);
    }


    /**
     * @notice Sets the official investment contract.
     *
     * The owner may replace the investment contract while ownership
     * still exists.
     *
     * The investment contract receives ONLY the DEX interaction
     * exemption. It receives no minting authority.
     */
    function setInvestContract(address newInvestContract) external onlyOwner {
        if (newInvestContract == address(0)) {
            revert ZeroAddress();
        }

        address previousInvestContract = investContract;

        investContract = newInvestContract;

        emit InvestContractSet(
            previousInvestContract,
            newInvestContract
        );
    }


    /**
     * @notice Permanently removes the owner.
     *
     * Before calling this function, make sure:
     *
     *   - Public buying has been enabled.
     *   - investContract is correct.
     *
     * After renouncing ownership, neither configuration can ever
     * be changed.
     */
    function renounceOwnership() external onlyOwner {
        address previousOwner = owner;

        owner = address(0);

        emit OwnershipRenounced(previousOwner);
    }


    // =============================================================
    // VIEW FUNCTIONS
    // =============================================================

    function buyingEnabled() public view returns (bool) {
        return buyingEnabledAt != 0;
    }


    function shieldEndTime() public view returns (uint256) {
        if (buyingEnabledAt == 0) {
            return 0;
        }

        return buyingEnabledAt + shieldDuration;
    }


    function shieldActive() public view returns (bool) {
        return (
            buyingEnabledAt != 0 &&
            block.timestamp < buyingEnabledAt + shieldDuration
        );
    }


    function timeUntilUnlockEligible() external view returns (uint256) {
        if (block.timestamp >= unlockTime) {
            return 0;
        }

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


    // =============================================================
    // DEX PAIR CALCULATION
    // =============================================================

    /**
     * @dev Computes the deterministic V2 pair address using CREATE2.
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

        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(
                                abi.encodePacked(token0, token1)
                            ),
                            initCodeHash
                        )
                    )
                )
            )
        );
    }


    // =============================================================
    // ERC20 TRANSFER LOGIC
    // =============================================================

    /**
     * @dev Handles EWC transfer restrictions.
     *
     * -------------------------------------------------------------
     * MINT
     * -------------------------------------------------------------
     *
     * address(0) -> deployer
     *
     * Happens only once during deployment.
     *
     *
     * -------------------------------------------------------------
     * PUBLIC BUY
     * -------------------------------------------------------------
     *
     * dexPair -> user
     *
     * Requires public buying to be enabled.
     *
     * During launch shield:
     *   - one buy per recipient per block
     *   - optional maximum buy
     *
     * Also records the recipient's block for same-block sell
     * protection.
     *
     *
     * -------------------------------------------------------------
     * INVESTMENT CONTRACT BUY
     * -------------------------------------------------------------
     *
     * dexPair -> investContract
     *
     * Exempt.
     *
     * This is required because deposit() performs:
     *
     * USDT -> Pancake Router -> Pair -> EWC -> investContract
     *
     *
     * -------------------------------------------------------------
     * INVESTMENT DISTRIBUTION
     * -------------------------------------------------------------
     *
     * investContract -> user
     *
     * Allowed.
     *
     * The recipient is marked with the current block so the user
     * cannot immediately sell to the DEX pair in the same block.
     *
     *
     * -------------------------------------------------------------
     * SELL
     * -------------------------------------------------------------
     *
     * user -> dexPair
     *
     * If the user received protected EWC during this block, the sell
     * is rejected.
     *
     * investContract itself is exempt because its internal protocol
     * operations may require DEX interaction.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {

        // ---------------------------------------------------------
        // INITIAL MINT
        // ---------------------------------------------------------

        if (from == address(0)) {
            super._update(from, to, value);
            return;
        }


        bool buy = from == dexPair;
        bool sell = to == dexPair;


        // ---------------------------------------------------------
        // PUBLIC DEX BUY
        // ---------------------------------------------------------

        if (buy && to != investContract) {
            uint256 enabledAt = buyingEnabledAt;

            /*
             * Public buying is disabled before launch.
             */
            if (enabledAt == 0) {
                revert BuyingNotEnabled();
            }


            /*
             * Temporary launch protection.
             */
            if (block.timestamp < enabledAt + shieldDuration) {

                /*
                 * Prevent the same recipient from receiving multiple
                 * public DEX buys in one block during the shield.
                 */
                if (_lastBuyBlock[to] == block.number) {
                    revert SameBlockBuy();
                }

                _lastBuyBlock[to] = block.number;


                /*
                 * Optional maximum EWC amount per public buy.
                 */
                if (
                    maxBuyAmount > 0 &&
                    value > maxBuyAmount
                ) {
                    revert MaxBuyExceeded(
                        value,
                        maxBuyAmount
                    );
                }
            }


            /*
             * Permanent same-block buy -> sell protection.
             *
             * Even after the temporary launch shield expires,
             * remember that this wallet received EWC from the pair
             * during this block.
             */
            lastProtectedReceiveBlock[to] = block.number;
        }


        // ---------------------------------------------------------
        // SELL PROTECTION
        // ---------------------------------------------------------

        if (sell && from != investContract) {
            /*
             * A wallet that:
             *
             *   - bought EWC from the DEX pair, OR
             *   - received EWC from investContract
             *
             * during the current block cannot sell it back to the
             * EWC pair during that same block.
             */
            if (lastProtectedReceiveBlock[from] == block.number) {
                revert SameBlockSell();
            }
        }


        // ---------------------------------------------------------
        // EXECUTE TRANSFER
        // ---------------------------------------------------------

        super._update(from, to, value);


        // ---------------------------------------------------------
        // INVESTMENT CONTRACT -> USER PROTECTION
        // ---------------------------------------------------------

        /*
         * This executes after the transfer succeeds.
         *
         * When the investment contract sends EWC to another address,
         * record that recipient's block.
         *
         * Do NOT record:
         *
         *   investContract -> burn address
         *   investContract -> dexPair
         *   investContract -> itself
         */
        if (
            investContract != address(0) &&
            from == investContract &&
            to != address(0) &&
            to != dexPair &&
            to != investContract
        ) {
            lastProtectedReceiveBlock[to] = block.number;
        }
    }
}