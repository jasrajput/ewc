// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {TestUSDT} from "../src/TestUSDT.sol";
import {EWCPresale} from "../src/EWCPresale.sol";

/// @notice Deploys only TestUSDT and EWCPresale for BSC testnet.
/// @dev The deployer is used as treasury. No EWC token or DEX is required.
contract DeployEWCPresale is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address treasury = deployer;

        console2.log("==========================================");
        console2.log("EWC PRESALE TESTNET DEPLOYMENT");
        console2.log("==========================================");
        console2.log("Deployer:", deployer);
        console2.log("Treasury:", treasury);

        vm.startBroadcast(privateKey);

        // 1. Deploy test USDT.
        TestUSDT usdt = new TestUSDT();
        console2.log("Test USDT:", address(usdt));

        // 2. Deploy presale using the new USDT address.
        EWCPresale presale = new EWCPresale(address(usdt), treasury);
        console2.log("EWC Presale:", address(presale));

        vm.stopBroadcast();

        console2.log("==========================================");
        console2.log("DEPLOYMENT COMPLETE");
        console2.log("==========================================");
        console2.log("Test USDT:", address(usdt));
        console2.log("EWC Presale:", address(presale));
        console2.log("Treasury:", treasury);
        console2.log("Presale start (UTC timestamp):", presale.PRESALE_START());
        console2.log("Presale end (UTC timestamp):", presale.PRESALE_END());
        console2.log("Minimum deposit (token units):", presale.minDeposit());
        console2.log("Maximum deposit (token units):", presale.maxDeposit());
        console2.log("==========================================");
        console2.log("NEXT:");
        console2.log("1. Fund test wallets with TestUSDT");
        console2.log("2. Approve presale to spend TestUSDT");
        console2.log("3. Deposit during the configured presale window");
        console2.log("4. Verify user deposit and event on-chain");
    }
}
