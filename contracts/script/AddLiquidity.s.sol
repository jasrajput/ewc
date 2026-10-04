// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPancakeRouterV2 {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        );
}

interface IPancakePairV2 {
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

    function balanceOf(address account)
        external
        view
        returns (uint256);
}

contract AddLiquidity is Script {
    // =============================================================
    // BSC TESTNET
    // =============================================================

    address constant PANCAKE_ROUTER =
        0xD99D1c33F9fC3444f8101754aBC46c52416550D1;

    // =============================================================
    // OUR DEPLOYED CONTRACTS
    // =============================================================

    address constant USDT =
        0x3C98e0f8153A9121ffb548EF51FDb2BAd40C0623;

    address constant EWC =
        0xE95223B12769C48DFecBCf05Ff85206FC8E87C0F;

    address constant PAIR =
        0xE582597008017AA36E86c5b83E14C862fCe48FeE;

    // =============================================================
    // INITIAL LIQUIDITY
    // =============================================================

    // Test USDT has 18 decimals.
    uint256 constant USDT_AMOUNT = 100_000 ether;

    // EWC has 18 decimals.
    uint256 constant EWC_AMOUNT = 2_000_000 ether;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        console2.log("==========================================");
        console2.log("ADD EWC / USDT LIQUIDITY");
        console2.log("==========================================");

        console2.log("Provider:", deployer);
        console2.log("USDT:", USDT);
        console2.log("EWC:", EWC);
        console2.log("Pair:", PAIR);

        // =========================================================
        // CHECK BALANCES
        // =============================================================

        uint256 usdtBalance = IERC20(USDT).balanceOf(deployer);
        uint256 ewcBalance = IERC20(EWC).balanceOf(deployer);

        console2.log("");
        console2.log("USDT balance:", usdtBalance / 1 ether);
        console2.log("EWC balance:", ewcBalance / 1 ether);

        require(
            usdtBalance >= USDT_AMOUNT,
            "INSUFFICIENT_USDT"
        );

        require(
            ewcBalance >= EWC_AMOUNT,
            "INSUFFICIENT_EWC"
        );

        vm.startBroadcast(privateKey);

        // =========================================================
        // APPROVE ROUTER
        // =============================================================

        IERC20(USDT).approve(
            PANCAKE_ROUTER,
            USDT_AMOUNT
        );

        IERC20(EWC).approve(
            PANCAKE_ROUTER,
            EWC_AMOUNT
        );

        // =========================================================
        // ADD LIQUIDITY
        // =============================================================

        (
            uint256 usdtUsed,
            uint256 ewcUsed,
            uint256 liquidity
        ) = IPancakeRouterV2(PANCAKE_ROUTER).addLiquidity(
            USDT,
            EWC,
            USDT_AMOUNT,
            EWC_AMOUNT,

            // Initial pool, so no slippage issue.
            // For later liquidity additions use proper minimums.
            0,
            0,

            // LP tokens go to deployer.
            deployer,

            // 10 minute deadline.
            block.timestamp + 10 minutes
        );

        vm.stopBroadcast();

        // =========================================================
        // VERIFY POOL
        // =============================================================

        IPancakePairV2 pair =
            IPancakePairV2(PAIR);

        (
            uint112 reserve0,
            uint112 reserve1,
        ) = pair.getReserves();

        address token0 = pair.token0();

        uint256 usdtReserve;
        uint256 ewcReserve;

        if (token0 == USDT) {
            usdtReserve = uint256(reserve0);
            ewcReserve = uint256(reserve1);
        } else {
            usdtReserve = uint256(reserve1);
            ewcReserve = uint256(reserve0);
        }

        uint256 lpBalance =
            pair.balanceOf(deployer);

        // =========================================================
        // RESULTS
        // =============================================================

        console2.log("");
        console2.log("==========================================");
        console2.log("LIQUIDITY ADDED");
        console2.log("==========================================");

        console2.log(
            "USDT used:",
            usdtUsed / 1 ether
        );

        console2.log(
            "EWC used:",
            ewcUsed / 1 ether
        );

        console2.log(
            "LP tokens minted:",
            liquidity
        );

        console2.log("");
        console2.log(
            "USDT reserve:",
            usdtReserve / 1 ether
        );

        console2.log(
            "EWC reserve:",
            ewcReserve / 1 ether
        );

        console2.log(
            "Your LP balance:",
            lpBalance
        );

        console2.log("");
        console2.log(
            "Expected initial EWC price: ~$0.05"
        );

        console2.log("==========================================");
    }
}