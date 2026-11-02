
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IEWCPayoutPool {
    function payUSDT(address to, uint256 amount) external;
    function payEWC(address to, uint256 amount) external;
}

contract EWCPayout is Ownable, ReentrancyGuard {
    IEWCPayoutPool public immutable commissionPool;

    address public rootUpdater;
    bytes32 public merkleRoot;
    uint256 public lastRootUpdateTime;

    uint256 public constant MANUAL_LIMIT = 3000 ether;

    mapping(address => uint256) public usdtClaimed;
    mapping(address => uint256) public roiEwcClaimed;
    mapping(address => uint256) public queuedUSDT;

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
        uint256 timestamp,
        bool isQueued
    );

    event WithdrawalQueued(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event WithdrawalPaid(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    error ZeroAddress();
    error NotRootUpdater();
    error InvalidMerkleRoot();
    error InvalidProof();
    error NothingToClaim();
    error NoQueuedWithdrawal();

    constructor(address _commissionPool) Ownable(msg.sender) {
        if (_commissionPool == address(0)) revert ZeroAddress();

        commissionPool = IEWCPayoutPool(_commissionPool);
        rootUpdater = msg.sender;
    }

    function setRootUpdater(address newUpdater) external onlyOwner {
        if (newUpdater == address(0)) revert ZeroAddress();

        emit RootUpdaterChanged(rootUpdater, newUpdater);
        rootUpdater = newUpdater;
    }

    function setMerkleRoot(bytes32 newRoot) external {
        if (msg.sender != rootUpdater) revert NotRootUpdater();
        if (newRoot == bytes32(0)) revert InvalidMerkleRoot();

        emit MerkleRootUpdated(
            merkleRoot,
            newRoot,
            block.timestamp
        );

        merkleRoot = newRoot;
        lastRootUpdateTime = block.timestamp;
    }

    function claim(
        uint256 cumulativeUsdtIncome,
        uint256 cumulativeRoiEwc,
        bytes32[] calldata proof
    ) external nonReentrant {
        bytes32 leaf = keccak256(
            abi.encode(
                msg.sender,
                cumulativeUsdtIncome,
                cumulativeRoiEwc
            )
        );

        if (!MerkleProof.verify(proof, merkleRoot, leaf)) {
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

        uint256 usdtAmount = cumulativeUsdtIncome - priorUSDT;
        uint256 ewcAmount = cumulativeRoiEwc - priorEWC;

        if (usdtAmount == 0 && ewcAmount == 0) {
            revert NothingToClaim();
        }

        // Update cumulative claim accounting.
        usdtClaimed[msg.sender] = cumulativeUsdtIncome;
        roiEwcClaimed[msg.sender] = cumulativeRoiEwc;

        totalUsdtIncomeClaimed += usdtAmount;
        totalRoiEwcClaimed += ewcAmount;

        bool isQueued = usdtAmount > MANUAL_LIMIT;

        // Pay automatically or queue for admin payment.
        if (usdtAmount != 0) {
            if (isQueued) {
                queuedUSDT[msg.sender] += usdtAmount;

                emit WithdrawalQueued(
                    msg.sender,
                    usdtAmount,
                    block.timestamp
                );
            } else {
                commissionPool.payUSDT(
                    msg.sender,
                    usdtAmount
                );
            }
        }

        // EWC ROI is independent of the USDT queue.
        if (ewcAmount != 0) {
            commissionPool.payEWC(
                msg.sender,
                ewcAmount
            );
        }

        // Record the user's claim once.
        _claims[msg.sender].push(
            ClaimRecord({
                usdtReceived: usdtAmount,
                roiEwcReceived: ewcAmount,
                cumulativeUsdtIncome: cumulativeUsdtIncome,
                cumulativeRoiEwc: cumulativeRoiEwc,
                timestamp: block.timestamp
            })
        );

        emit Claimed(
            msg.sender,
            usdtAmount,
            ewcAmount,
            cumulativeUsdtIncome,
            cumulativeRoiEwc,
            block.timestamp,
            isQueued
        );
    }

    // Admin batch payment, including partial withdrawals.
    function payQueuedWithdrawal(
        address[] calldata users,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        uint256 length = users.length;

        require(
            length > 0 &&
            length <= 50 &&
            length == amounts.length,
            "Invalid batch"
        );

        for (uint256 i = 0; i < length; ++i) {
            address user = users[i];
            uint256 amount = amounts[i];

            if (user == address(0)) revert ZeroAddress();
            if (amount == 0) revert NoQueuedWithdrawal();

            require(
                queuedUSDT[user] >= amount,
                "Insufficient queued balance"
            );

            queuedUSDT[user] -= amount;

            commissionPool.payUSDT(user, amount);

            emit WithdrawalPaid(
                user,
                amount,
                block.timestamp
            );
        }
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
