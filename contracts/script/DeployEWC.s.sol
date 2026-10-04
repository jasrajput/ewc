// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {TestUSDT} from "../src/TestUSDT.sol";
import {EWCToken} from "../src/EWC.sol";
import {EWCCommissionPool} from "../src/EWCCommissionPool.sol";
import {EWCInvestment} from "../src/EWCInvestment.sol";

interface IPancakeFactoryV2 {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

contract DeployEWC is Script {
    // =============================================================
    // PANCAKESWAP V2 - BSC TESTNET
    // =============================================================

    address constant PANCAKE_ROUTER = 0xD99D1c33F9fC3444f8101754aBC46c52416550D1;

    address constant PANCAKE_FACTORY = 0x6725F303b657a9451d8BA641348b6761A6CC7a17;

    /*
        IMPORTANT:
        Set the correct init-code hash for the exact factory above.
        Do not guess this value.
    */
    bytes32 constant PANCAKE_PAIR_INIT_CODE_HASH = 0xd0d4c4cd0848c93cb4fd1f498d7013ee6bfb25783ea21593d5834f5d250ece66;

    // =============================================================
    // INVESTMENT CONFIG
    // =============================================================

    uint256 constant MIN_DEPOSIT = 25 ether;
    uint256 constant MAX_DEPOSIT = 5_000 ether;

    // =============================================================
    // TOKEN CONFIG
    // =============================================================

    uint256 constant SHIELD_DURATION = 1 hours;
    uint256 constant MAX_BUY_AMOUNT = 100_000 ether;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        uint256 unlockTime = vm.envUint("EWC_UNLOCK_TIME");

        address deployer = vm.addr(privateKey);

        // For testnet we can use deployer as treasury.
        // Change later if you want a separate treasury wallet.
        address treasury = deployer;

        require(unlockTime > block.timestamp, "INVALID_UNLOCK_TIME");
        require(
            PANCAKE_PAIR_INIT_CODE_HASH != bytes32(0),
            "SET_PAIR_INIT_CODE_HASH"
        );

        console2.log("==========================================");
        console2.log("EWC TESTNET DEPLOYMENT");
        console2.log("==========================================");
        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);

        vm.startBroadcast(privateKey);

        // =========================================================
        // 1. DEPLOY TEST USDT
        // =========================================================

        TestUSDT usdt = new TestUSDT();

        console2.log("");
        console2.log("Test USDT:");
        console2.log(address(usdt));

        // =========================================================
        // 2. DEPLOY EWC
        // =========================================================

        EWCToken ewc = new EWCToken(
            unlockTime,
            SHIELD_DURATION,
            MAX_BUY_AMOUNT,
            PANCAKE_FACTORY,
            address(usdt),
            PANCAKE_PAIR_INIT_CODE_HASH
        );

        console2.log("");
        console2.log("EWC:");
        console2.log(address(ewc));

        // =========================================================
        // 3. CREATE PANCAKESWAP EWC / TEST-USDT PAIR
        // =========================================================

        IPancakeFactoryV2 factory =
            IPancakeFactoryV2(PANCAKE_FACTORY);

        address pair =
            factory.getPair(address(ewc), address(usdt));

        if (pair == address(0)) {
            pair = factory.createPair(
                address(ewc),
                address(usdt)
            );

            console2.log("");
            console2.log("New EWC/USDT Pair:");
            console2.log(pair);
        } else {
            console2.log("");
            console2.log("Existing EWC/USDT Pair:");
            console2.log(pair);
        }

        // Verify token calculated the same pair.
        require(
            pair == ewc.dexPair(),
            "EWC_PAIR_MISMATCH"
        );

        // =========================================================
        // 4. DEPLOY COMMISSION POOL
        // =========================================================

        EWCCommissionPool commissionPool =
            new EWCCommissionPool(
                address(usdt),
                address(ewc)
            );

        console2.log("");
        console2.log("Commission Pool:");
        console2.log(address(commissionPool));

        // =========================================================
        // 5. DEPLOY INVESTMENT + PAYOUT
        // =========================================================

        EWCInvestment investment =
            new EWCInvestment(
                address(usdt),
                address(ewc),
                PANCAKE_ROUTER,
                pair,
                address(commissionPool),
                treasury,
                MIN_DEPOSIT,
                MAX_DEPOSIT
            );

        console2.log("");
        console2.log("Investment/Payout:");
        console2.log(address(investment));

        // =========================================================
        // 6. CONNECT COMMISSION POOL
        // =========================================================

        commissionPool.setPayoutContract(
            address(investment)
        );

        // =========================================================
        // 7. SET EWC PROTOCOL CONTRACT
        // =========================================================

        ewc.setInvestContract(
            address(investment)
        );

        vm.stopBroadcast();

        // =========================================================
        // DEPLOYMENT SUMMARY
        // =========================================================

        console2.log("");
        console2.log("==========================================");
        console2.log("DEPLOYMENT COMPLETE");
        console2.log("==========================================");

        console2.log("Test USDT:");
        console2.log(address(usdt));

        console2.log("EWC:");
        console2.log(address(ewc));

        console2.log("EWC/USDT Pair:");
        console2.log(pair);

        console2.log("Commission Pool:");
        console2.log(address(commissionPool));

        console2.log("Investment/Payout:");
        console2.log(address(investment));

        console2.log("Treasury:");
        console2.log(treasury);

        console2.log("");
        console2.log("NEXT:");
        console2.log("1. Add EWC + Test USDT liquidity");
        console2.log("2. Fund Commission Pool with EWC");
        console2.log("3. Send Test USDT to test users");
        console2.log("4. Test deposit");
        console2.log("5. Test Merkle claims");
    }
}