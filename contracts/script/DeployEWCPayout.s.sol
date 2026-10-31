
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {EWCCommissionPool} from "../src/EWCCommissionPool.sol";
import {EWCPayout} from "../src/EWCPayout.sol";

/// @notice Deploy EWCCommissionPool and EWCPayout on BSC testnet.
/// @dev EWC token is not required during initial deployment.
contract DeployEWCPayout is Script {

    // Replace with your already deployed TestUSDT address.
    address constant USDT_ADDRESS = 0xC9ba07e331DBfe20691C74E0e0d975D4B109FA33;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        address rootUpdater = vm.envOr(
            "ROOT_UPDATER_ADDRESS",
            deployer
        );

        require(USDT_ADDRESS != address(0), "Invalid USDT address");
        require(USDT_ADDRESS.code.length > 0, "USDT contract not deployed");
        require(rootUpdater != address(0), "Invalid root updater");

        console2.log("==========================================");
        console2.log("EWC PAYOUT TESTNET DEPLOYMENT");
        console2.log("==========================================");

        console2.log("Deployer:", deployer);
        console2.log("USDT Token:", USDT_ADDRESS);
        console2.log("Root Updater:", rootUpdater);
        console2.log("EWC Token: Not configured yet");

        vm.startBroadcast(privateKey);

        // 1. Deploy CommissionPool with USDT only.
        EWCCommissionPool commissionPool = new EWCCommissionPool(
            USDT_ADDRESS
        );

        console2.log("Commission Pool:", address(commissionPool));

        // 2. Deploy Merkle payout contract.
        EWCPayout payout = new EWCPayout(
            address(commissionPool)
        );

        console2.log("EWC Payout:", address(payout));

        // 3. Authorize payout contract in CommissionPool.
        commissionPool.setPayoutContract(address(payout));

        // 4. Configure root updater.
        if (rootUpdater != deployer) {
            payout.setRootUpdater(rootUpdater);
        }

        vm.stopBroadcast();

        // 5. Verify deployment.
        require(
            commissionPool.payoutContract() == address(payout),
            "Payout authorization failed"
        );

        require(
            payout.rootUpdater() == rootUpdater,
            "Root updater configuration failed"
        );

        require(
            address(payout.commissionPool()) == address(commissionPool),
            "Commission pool mismatch"
        );

        require(
            address(commissionPool.usdt()) == USDT_ADDRESS,
            "USDT configuration mismatch"
        );

        require(
            address(commissionPool.ewc()) == address(0),
            "EWC should not be configured yet"
        );

        console2.log("==========================================");
        console2.log("DEPLOYMENT COMPLETE");
        console2.log("==========================================");

        console2.log("Commission Pool:", address(commissionPool));
        console2.log("EWC Payout:", address(payout));
        console2.log("Pool Owner:", commissionPool.owner());
        console2.log("Payout Owner:", payout.owner());
        console2.log("Root Updater:", payout.rootUpdater());
        console2.log("USDT Token:", address(commissionPool.usdt()));
        console2.log("EWC Token: Not configured");

        console2.log("Initial Merkle Root:");
        console2.logBytes32(payout.merkleRoot());

        console2.log("==========================================");
        console2.log("NEXT STEPS");
        console2.log("==========================================");

        console2.log("1. Fund CommissionPool with TestUSDT");
        console2.log("2. Configure MERKLE_CONTRACT in closing-node");
        console2.log("3. Deploy EWC token later");
        console2.log("4. Call commissionPool.setEWCToken(ewcAddress)");
        console2.log("5. Publish Merkle roots when payouts are enabled");
        console2.log("==========================================");
    }
}
