// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPancakeRouterV2 {
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IPancakePairV2 {
    function token0() external view returns (address);

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );
}

interface IEWCInvestment {
    function deposit(uint256 usdtAmount, uint256 minEwcOut) external;

    function getCurrentEwcPrice() external view returns (uint256);

    function previewEwcAllocation(
        uint256 usdtAmount
    ) external view returns (
        uint256 ewcPrice,
        uint256 allocatedEWC
    );

    function getUserDepositCount(
        address user
    ) external view returns (uint256);

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
        );
}

contract TestDeposit is Script {
    address constant USDT =
        0x3C98e0f8153A9121ffb548EF51FDb2BAd40C0623;

    address constant EWC =
        0xE95223B12769C48DFecBCf05Ff85206FC8E87C0F;

    address constant PAIR =
        0xE582597008017AA36E86c5b83E14C862fCe48FeE;

    address constant COMMISSION_POOL =
        0x358293348Ed81D22049530427d3AfB4c040f8AD9;

    address constant INVESTMENT =
        0x7997dF07c925776152de13dcF6db3c6CA260FD01;

    address constant PANCAKE_ROUTER =
        0xD99D1c33F9fC3444f8101754aBC46c52416550D1;

    uint256 constant INVEST_AMOUNT = 1_000 ether;

    uint256 constant MARKET_BUY_BPS = 2_000;
    uint256 constant SLIPPAGE_BPS = 500;
    uint256 constant BPS = 10_000;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address user = vm.addr(privateKey);

        console2.log("");
        console2.log("==========================================");
        console2.log("EWC TEST DEPOSIT");
        console2.log("==========================================");
        console2.log("User:", user);
        console2.log("Investment: 1000 USDT");

        printBefore(user);

        uint256 minEwcOut = calculateMinEwcOut();

        executeDeposit(privateKey, minEwcOut);

        printAfter(user);
    }

    // =============================================================
    // BEFORE
    // =============================================================

    function printBefore(address user) internal view {
        IEWCInvestment investment = IEWCInvestment(INVESTMENT);

        uint256 userUsdt =
            IERC20(USDT).balanceOf(user);

        uint256 commissionUsdt =
            IERC20(USDT).balanceOf(COMMISSION_POOL);

        uint256 investmentEwc =
            IERC20(EWC).balanceOf(INVESTMENT);

        uint256 price =
            investment.getCurrentEwcPrice();

        (
            uint256 allocationPrice,
            uint256 allocatedEWC
        ) = investment.previewEwcAllocation(
            INVEST_AMOUNT
        );

        console2.log("");
        console2.log("----- BEFORE -----");

        console2.log(
            "User USDT:",
            userUsdt / 1 ether
        );

        console2.log(
            "EWC Price:",
            price
        );

        console2.log(
            "Allocation Price:",
            allocationPrice
        );

        console2.log(
            "User EWC Allocation:",
            allocatedEWC / 1 ether
        );

        console2.log(
            "Commission Pool USDT:",
            commissionUsdt / 1 ether
        );

        console2.log(
            "Investment Contract EWC:",
            investmentEwc / 1 ether
        );

        printReserves("Pool Before");
    }

    // =============================================================
    // CALCULATE INTERNAL SWAP MINIMUM
    // =============================================================

    function calculateMinEwcOut()
        internal
        view
        returns (uint256 minEwcOut)
    {
        uint256 marketBuyUSDT =
            (INVEST_AMOUNT * MARKET_BUY_BPS) / BPS;

        address[] memory path =
            new address[](2);

        path[0] = USDT;
        path[1] = EWC;

        uint256[] memory amounts =
            IPancakeRouterV2(PANCAKE_ROUTER)
                .getAmountsOut(
                    marketBuyUSDT,
                    path
                );

        uint256 expectedEWC =
            amounts[1];

        minEwcOut =
            expectedEWC -
            ((expectedEWC * SLIPPAGE_BPS) / BPS);

        console2.log("");
        console2.log("----- SWAP PROTECTION -----");

        console2.log(
            "Expected EWC Out:",
            expectedEWC / 1 ether
        );

        console2.log(
            "Minimum EWC Out:",
            minEwcOut / 1 ether
        );
    }

    // =============================================================
    // EXECUTE
    // =============================================================

    function executeDeposit(
        uint256 privateKey,
        uint256 minEwcOut
    ) internal {
        vm.startBroadcast(privateKey);

        IERC20(USDT).approve(
            INVESTMENT,
            INVEST_AMOUNT
        );

        IEWCInvestment(INVESTMENT).deposit(
            INVEST_AMOUNT,
            minEwcOut
        );

        vm.stopBroadcast();
    }

    // =============================================================
    // AFTER
    // =============================================================

    function printAfter(address user) internal view {
        IEWCInvestment investment =
            IEWCInvestment(INVESTMENT);

        console2.log("");
        console2.log("==========================================");
        console2.log("DEPOSIT SUCCESS");
        console2.log("==========================================");

        console2.log(
            "User USDT:",
            IERC20(USDT).balanceOf(user) / 1 ether
        );

        console2.log(
            "Commission Pool USDT:",
            IERC20(USDT).balanceOf(COMMISSION_POOL) / 1 ether
        );

        console2.log(
            "Treasury / User USDT:"
        );

        console2.log(
            IERC20(USDT).balanceOf(user) / 1 ether
        );

        console2.log(
            "Investment Contract EWC:",
            IERC20(EWC).balanceOf(INVESTMENT) / 1 ether
        );

        console2.log(
            "Current EWC Price:",
            investment.getCurrentEwcPrice()
        );

        uint256 count =
            investment.getUserDepositCount(user);

        console2.log(
            "Deposit Count:",
            count
        );

        printReserves("Pool After");

        if (count > 0) {
            printDeposit(
                user,
                count - 1
            );
        }
    }

    // =============================================================
    // DEPOSIT RECORD
    // =============================================================

    function printDeposit(
        address user,
        uint256 index
    ) internal view {
        (
            address payer,
            uint256 usdtAmount,
            uint256 allocationPrice,
            uint256 allocatedEWC,
            uint256 marketBuyUSDT,
            uint256 marketBoughtEWC,
            uint256 commissionUSDT,
            uint256 treasuryUSDT,
            uint256 timestamp
        ) = IEWCInvestment(INVESTMENT)
            .getUserDeposit(
                user,
                index
            );

        console2.log("");
        console2.log("----- DEPOSIT RECORD -----");

        console2.log(
            "Payer:",
            payer
        );

        console2.log(
            "Investment USDT:",
            usdtAmount / 1 ether
        );

        console2.log(
            "Allocation Price:",
            allocationPrice
        );

        console2.log(
            "EWC Allocation:",
            allocatedEWC / 1 ether
        );

        console2.log(
            "Market Buy USDT:",
            marketBuyUSDT / 1 ether
        );

        console2.log(
            "Market Bought EWC:",
            marketBoughtEWC / 1 ether
        );

        console2.log(
            "Commission USDT:",
            commissionUSDT / 1 ether
        );

        console2.log(
            "Treasury USDT:",
            treasuryUSDT / 1 ether
        );

        console2.log(
            "Timestamp:",
            timestamp
        );
    }

    // =============================================================
    // POOL RESERVES
    // =============================================================

    function printReserves(
        string memory title
    ) internal view {
        IPancakePairV2 pair =
            IPancakePairV2(PAIR);

        (
            uint112 reserve0,
            uint112 reserve1,
        ) = pair.getReserves();

        uint256 usdtReserve;
        uint256 ewcReserve;

        if (pair.token0() == USDT) {
            usdtReserve =
                uint256(reserve0);

            ewcReserve =
                uint256(reserve1);
        } else {
            usdtReserve =
                uint256(reserve1);

            ewcReserve =
                uint256(reserve0);
        }

        console2.log("");
        console2.log(title);

        console2.log(
            "USDT Reserve:",
            usdtReserve / 1 ether
        );

        console2.log(
            "EWC Reserve:",
            ewcReserve / 1 ether
        );
    }
}