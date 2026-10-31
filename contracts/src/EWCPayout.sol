
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IEWCPayoutPool {
    function payUSDT(address to, uint256 amount) external;
    function payEWC(address to, uint256 amount) external;
}

/**
 * @notice Shared cumulative Merkle payout ledger
 * for EWCPresale and EWCInvestment.
 *
 * @dev Entitlements are calculated off-chain and
 * committed through a Merkle root.
 *
 * Both investment sources are combined into each
 * user's cumulative entitlements.
 *
 * CommissionPool must authorize this contract
 * through setPayoutContract().
 */
contract EWCPayout is Ownable, ReentrancyGuard {

    IEWCPayoutPool public immutable commissionPool;

    address public rootUpdater;

    bytes32 public merkleRoot;

    uint256 public lastRootUpdateTime;

    mapping(address => uint256) public usdtClaimed;
    mapping(address => uint256) public roiEwcClaimed;

    uint256 public totalUsdtIncomeClaimed;
    uint256 public totalRoiEwcClaimed;

    struct ClaimRecord {
        uint256 usdtReceived;
        uint256 roiEwcReceived;
        uint256 cumulativeUsdtIncome;
        uint256 cumulativeRoiEwc;
        uint256 timestamp;
    }

    mapping(address => ClaimRecord[]) private _claims;

    event MerkleRootUpdated(
        bytes32 indexed oldRoot,
        bytes32 indexed newRoot,
        uint256 timestamp
    );

    event RootUpdaterChanged(
        address indexed oldUpdater,
        address indexed newUpdater
    );

    event Claimed(
        address indexed user,
        uint256 usdtAmount,
        uint256 roiEwcAmount,
        uint256 cumulativeUsdtIncome,
        uint256 cumulativeRoiEwc,
        uint256 timestamp
    );

    error ZeroAddress();
    error NotRootUpdater();
    error InvalidMerkleRoot();
    error InvalidProof();
    error NothingToClaim();

    constructor(address _commissionPool)
        Ownable(msg.sender)
    {
        if (_commissionPool == address(0)) {
            revert ZeroAddress();
        }

        commissionPool = IEWCPayoutPool(_commissionPool);

        rootUpdater = msg.sender;
    }

    function setRootUpdater(address newUpdater)
        external
        onlyOwner
    {
        if (newUpdater == address(0)) {
            revert ZeroAddress();
        }

        emit RootUpdaterChanged(
            rootUpdater,
            newUpdater
        );

        rootUpdater = newUpdater;
    }

    function setMerkleRoot(bytes32 newRoot) external {
        if (msg.sender != rootUpdater) {
            revert NotRootUpdater();
        }

        if (newRoot == bytes32(0)) {
            revert InvalidMerkleRoot();
        }

        emit MerkleRootUpdated(
            merkleRoot,
            newRoot,
            block.timestamp
        );

        merkleRoot = newRoot;

        lastRootUpdateTime = block.timestamp;
    }

    /**
     * @notice Claim combined presale and
     * regular investment entitlements.
     *
     * @dev Leaf encoding:
     *
     * keccak256(
     *     abi.encode(
     *         user,
     *         cumulativeUsdtIncome,
     *         cumulativeRoiEwc
     *     )
     * )
     *
     * The backend must combine cumulative
     * entitlements from both investment sources.
     */
    function claim(
        uint256 cumulativeUsdtIncome,
        uint256 cumulativeRoiEwc,
        bytes32[] calldata proof
    )
        external
        nonReentrant
    {
        bytes32 leaf = keccak256(
            abi.encode(
                msg.sender,
                cumulativeUsdtIncome,
                cumulativeRoiEwc
            )
        );

        if (
            !MerkleProof.verify(
                proof,
                merkleRoot,
                leaf
            )
        ) {
            revert InvalidProof();
        }

        uint256 priorUSDT = usdtClaimed[msg.sender];
        uint256 priorEWC = roiEwcClaimed[msg.sender];

        if (
            cumulativeUsdtIncome < priorUSDT ||
            cumulativeRoiEwc < priorEWC
        ) {
            revert InvalidProof();
        }

        uint256 usdtAmount =
            cumulativeUsdtIncome - priorUSDT;

        uint256 ewcAmount =
            cumulativeRoiEwc - priorEWC;

        if (
            usdtAmount == 0 &&
            ewcAmount == 0
        ) {
            revert NothingToClaim();
        }

        // Update claim accounting before transfers

        usdtClaimed[msg.sender] =
            cumulativeUsdtIncome;

        roiEwcClaimed[msg.sender] =
            cumulativeRoiEwc;

        totalUsdtIncomeClaimed += usdtAmount;

        totalRoiEwcClaimed += ewcAmount;

        // Transfer USDT income

        if (usdtAmount != 0) {
            commissionPool.payUSDT(
                msg.sender,
                usdtAmount
            );
        }

        // Transfer EWC ROI

        if (ewcAmount != 0) {
            commissionPool.payEWC(
                msg.sender,
                ewcAmount
            );
        }

        // Record claim history

        _claims[msg.sender].push(
            ClaimRecord({
                usdtReceived: usdtAmount,
                roiEwcReceived: ewcAmount,
                cumulativeUsdtIncome:
                    cumulativeUsdtIncome,
                cumulativeRoiEwc:
                    cumulativeRoiEwc,
                timestamp: block.timestamp
            })
        );

        emit Claimed(
            msg.sender,
            usdtAmount,
            ewcAmount,
            cumulativeUsdtIncome,
            cumulativeRoiEwc,
            block.timestamp
        );
    }

    function getUserClaimCount(address user)
        external
        view
        returns (uint256)
    {
        return _claims[user].length;
    }

    function getUserClaim(
        address user,
        uint256 index
    )
        external
        view
        returns (ClaimRecord memory)
    {
        return _claims[user][index];
    }
}
