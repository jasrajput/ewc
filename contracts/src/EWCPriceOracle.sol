
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IPancakeV2OraclePair {
    function token0() external view returns (address);
    function token1() external view returns (address);

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );

    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

interface IERC20OracleDecimals {
    function decimals() external view returns (uint8);
}

/**
 * @title EWCPriceOracle
 * @notice Sliding-window TWAP for an EWC/USDT PancakeSwap V2 pair.
 * @dev Both tokens must have 18 decimals.
 *
 * Output:
 *   USDT base units per 1 whole EWC (1e18 EWC).
 *   $0.01 per EWC => 10000000000000000.
 *
 * This oracle does NOT enforce a spot/TWAP deviation check.
 * It must be maintained by regular permissionless update() calls.
 */
contract EWCPriceOracle {
    uint256 private constant Q112 = 2 ** 112;
    uint256 private constant ONE_EWC = 1e18;

    error ZeroAddress();
    error InvalidPair();
    error InvalidDecimals();
    error InvalidConfiguration();
    error NoLiquidity();
    error OracleNotReady();
    error MissingHistoricalObservation();
    error InvalidOraclePrice();

    struct Observation {
        uint256 timestamp;
        uint256 cumulative;
    }

    IPancakeV2OraclePair public immutable pair;

    address public immutable ewc;
    address public immutable usdt;

    bool public immutable ewcIsToken0;

    uint256 public immutable windowSeconds;
    uint256 public immutable periodSeconds;
    uint256 public immutable observationCapacity;

    uint256 public observationCount;
    uint256 public nextObservationIndex;
    uint256 public lastObservationTimestamp;

    mapping(uint256 => Observation) public observations;

    event ObservationRecorded(
        uint256 indexed index,
        uint256 timestamp,
        uint256 cumulative
    );

    constructor(
        address _pair,
        address _ewc,
        address _usdt,
        uint256 _windowSeconds,
        uint256 _periodSeconds
    ) {
        if (
            _pair == address(0) ||
            _ewc == address(0) ||
            _usdt == address(0)
        ) {
            revert ZeroAddress();
        }

        if (_ewc == _usdt) revert InvalidPair();

        if (
            _periodSeconds == 0 ||
            _windowSeconds <= 2 * _periodSeconds ||
            _windowSeconds % _periodSeconds != 0
        ) {
            revert InvalidConfiguration();
        }

        uint256 capacity =
            (_windowSeconds / _periodSeconds) + 3;

        if (capacity > 256) revert InvalidConfiguration();

        IPancakeV2OraclePair selectedPair =
            IPancakeV2OraclePair(_pair);

        address token0 = selectedPair.token0();
        address token1 = selectedPair.token1();

        if (
            !(
                (token0 == _ewc && token1 == _usdt) ||
                (token0 == _usdt && token1 == _ewc)
            )
        ) {
            revert InvalidPair();
        }

        if (
            IERC20OracleDecimals(_ewc).decimals() != 18 ||
            IERC20OracleDecimals(_usdt).decimals() != 18
        ) {
            revert InvalidDecimals();
        }

        pair = selectedPair;
        ewc = _ewc;
        usdt = _usdt;
        ewcIsToken0 = token0 == _ewc;

        windowSeconds = _windowSeconds;
        periodSeconds = _periodSeconds;
        observationCapacity = capacity;

        // Seed the first observation only after liquidity exists.
        (
            uint112 reserve0,
            uint112 reserve1,
        ) = _reserves();

        if (reserve0 == 0 || reserve1 == 0) {
            revert NoLiquidity();
        }

        uint256 cumulative = _currentCumulativePrice();

        observations[0] = Observation({
            timestamp: block.timestamp,
            cumulative: cumulative
        });

        observationCount = 1;
        nextObservationIndex = 1;
        lastObservationTimestamp = block.timestamp;

        emit ObservationRecorded(
            0,
            block.timestamp,
            cumulative
        );
    }

    /**
     * @notice Store a cumulative-price observation.
     * @dev Permissionless. Returns false if it is too soon or
     * current reserves are empty. Does not enforce price bounds.
     *
     * Run repeatedly through an external keeper.
     */
    function update() external returns (bool recorded) {
        if (
            block.timestamp - lastObservationTimestamp <
            periodSeconds
        ) {
            return false;
        }

        (uint112 reserve0, uint112 reserve1) = _reserves();

        if (reserve0 == 0 || reserve1 == 0) {
            return false;
        }

        uint256 cumulative = _currentCumulativePrice();

        uint256 index = nextObservationIndex;

        observations[index] = Observation({
            timestamp: block.timestamp,
            cumulative: cumulative
        });

        if (observationCount < observationCapacity) {
            ++observationCount;
        }

        nextObservationIndex =
            (index + 1) % observationCapacity;

        lastObservationTimestamp = block.timestamp;

        emit ObservationRecorded(
            index,
            block.timestamp,
            cumulative
        );

        return true;
    }

    /**
     * @notice Return the EWC/USDT TWAP price.
     * @return priceWei USDT with 18 decimals per 1 EWC.
     *
     * The historical observation must be within the target
     * start range. Otherwise consultation fails closed.
     */
    function consultEwcPrice()
        external
        view
        returns (uint256 priceWei)
    {
        if (observationCount < 2) {
            revert OracleNotReady();
        }

        if (block.timestamp < windowSeconds) {
            revert OracleNotReady();
        }

        (uint112 reserve0, uint112 reserve1) = _reserves();

        if (reserve0 == 0 || reserve1 == 0) {
            revert NoLiquidity();
        }

        uint256 targetTimestamp =
            block.timestamp - windowSeconds;

        uint256 maximumStartTimestamp =
            targetTimestamp + 2 * periodSeconds;

        uint256 selectedTimestamp = type(uint256).max;
        uint256 selectedCumulative;

        // Find the earliest suitable observation within
        // the allowed beginning-of-window range.
        for (uint256 i = 0; i < observationCount; ++i) {
            Observation memory obs = observations[i];

            if (
                obs.timestamp >= targetTimestamp &&
                obs.timestamp <= maximumStartTimestamp &&
                obs.timestamp < selectedTimestamp
            ) {
                selectedTimestamp = obs.timestamp;
                selectedCumulative = obs.cumulative;
            }
        }

        if (selectedTimestamp == type(uint256).max) {
            revert MissingHistoricalObservation();
        }

        uint256 elapsed = block.timestamp - selectedTimestamp;

        if (
            elapsed < windowSeconds - 2 * periodSeconds ||
            elapsed > windowSeconds
        ) {
            revert MissingHistoricalObservation();
        }

        uint256 currentCumulative = _currentCumulativePrice();

        uint256 cumulativeDifference;

        // PancakeSwap V2 cumulative accumulators intentionally
        // wrap on uint256 overflow.
        unchecked {
            cumulativeDifference =
                currentCumulative - selectedCumulative;
        }

        uint256 averagePriceX112 =
            cumulativeDifference / elapsed;

        priceWei = Math.mulDiv(
            averagePriceX112,
            ONE_EWC,
            Q112
        );

        if (priceWei == 0) {
            revert InvalidOraclePrice();
        }
    }

    /**
     * @notice Check whether there is a usable observation.
     * @dev Does not promise consult success if liquidity is
     * unavailable or the resulting price is zero.
     */
    function hasHistoricalObservation()
        external
        view
        returns (bool)
    {
        if (observationCount < 2) return false;
        if (block.timestamp < windowSeconds) return false;

        uint256 targetTimestamp =
            block.timestamp - windowSeconds;

        uint256 maximumStartTimestamp =
            targetTimestamp + 2 * periodSeconds;

        for (uint256 i = 0; i < observationCount; ++i) {
            uint256 timestamp = observations[i].timestamp;

            if (
                timestamp >= targetTimestamp &&
                timestamp <= maximumStartTimestamp
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @dev Return the appropriate PancakeSwap cumulative
     * price, extended counterfactually to the current block.
     */
    function _currentCumulativePrice()
        internal
        view
        returns (uint256 cumulative)
    {
        cumulative = ewcIsToken0
            ? pair.price0CumulativeLast()
            : pair.price1CumulativeLast();

        (
            uint112 reserve0,
            uint112 reserve1,
            uint32 pairTimestamp
        ) = pair.getReserves();

        if (reserve0 == 0 || reserve1 == 0) {
            revert NoLiquidity();
        }

        uint32 currentTimestamp = uint32(block.timestamp);

        uint32 timeElapsed;

        // PancakeSwap's uint32 pair timestamp wraps by design.
        unchecked {
            timeElapsed = currentTimestamp - pairTimestamp;
        }

        if (timeElapsed != 0) {
            uint256 ratioX112 = ewcIsToken0
                ? (uint256(reserve1) * Q112) / reserve0
                : (uint256(reserve0) * Q112) / reserve1;

            // Cumulative additions intentionally wrap.
            unchecked {
                cumulative += ratioX112 * timeElapsed;
            }
        }
    }

    function _reserves()
        internal
        view
        returns (uint112 reserve0, uint112 reserve1)
    {
        (reserve0, reserve1, ) = pair.getReserves();
    }
}
