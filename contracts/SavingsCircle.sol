// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Tokenized Savings Circle (Ajo/Esusu/ROSCA)
 * @dev An improved smart contract for rotating savings and credit association.
 */
contract SavingsCircle {
    address public admin;
    uint256 public contributionAmount;
    uint256 public roundDuration;
    uint256 public startTime;
    uint256 public currentRound;
    uint256 public maxMembers;

    // Manual reentrancy guard
    bool private _locked;

    struct Member {
        address addr;
        bool hasReceived;
        uint256 missedRounds;
    }

    address[] public payoutOrder;
    mapping(address => Member) public members;
    address[] public memberList;

    // Track round-specific contributions
    mapping(uint256 => mapping(address => bool)) public roundContributions;
    mapping(uint256 => uint256) public roundTotalContributions;

    enum CircleState {
        NotStarted,
        Active,
        Completed
    }
    CircleState public state;

    // Events for better tracking
    event MemberJoined(address indexed member);
    event CircleStarted(uint256 startTime);
    event ContributionMade(
        address indexed member,
        uint256 amount,
        uint256 round
    );
    event PayoutDistributed(
        address indexed recipient,
        uint256 amount,
        uint256 round
    );
    event CircleCompleted();
    event RoundAdvanced(uint256 newRound);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }

    modifier onlyMember() {
        require(members[msg.sender].addr != address(0), "Not a member");
        _;
    }

    modifier circleActive() {
        require(state == CircleState.Active, "Circle not active");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        uint256 _contributionAmount,
        uint256 _roundDuration,
        uint256 _maxMembers
    ) {
        require(
            _contributionAmount > 0,
            "Contribution amount must be positive"
        );
        require(_roundDuration > 0, "Round duration must be positive");
        require(_maxMembers >= 2, "Need at least 2 members");
        require(_maxMembers <= 50, "Too many members"); // Reasonable gas limit

        admin = msg.sender;
        contributionAmount = _contributionAmount;
        roundDuration = _roundDuration;
        maxMembers = _maxMembers;
        state = CircleState.NotStarted;
        _locked = false;
    }

    function joinCircle() external {
        require(state == CircleState.NotStarted, "Circle already started");
        require(members[msg.sender].addr == address(0), "Already joined");
        require(memberList.length < maxMembers, "Circle full");

        members[msg.sender] = Member({
            addr: msg.sender,
            hasReceived: false,
            missedRounds: 0
        });

        memberList.push(msg.sender);
        emit MemberJoined(msg.sender);
    }

    function startCircle() external onlyAdmin {
        require(state == CircleState.NotStarted, "Already started");
        require(memberList.length >= 2, "Need at least 2 members to start");
        require(memberList.length <= maxMembers, "Too many members");

        payoutOrder = memberList;
        startTime = block.timestamp;
        currentRound = 0;
        state = CircleState.Active;

        emit CircleStarted(startTime);
    }

    function contribute()
        external
        payable
        onlyMember
        circleActive
        nonReentrant
    {
        require(
            msg.value == contributionAmount,
            "Incorrect contribution amount"
        );
        require(
            !roundContributions[currentRound][msg.sender],
            "Already contributed this round"
        );

        // Update round-specific tracking
        roundContributions[currentRound][msg.sender] = true;
        roundTotalContributions[currentRound] += msg.value;

        emit ContributionMade(msg.sender, msg.value, currentRound);
    }

    function advanceRound() external onlyAdmin circleActive nonReentrant {
        require(
            block.timestamp >= startTime + (currentRound + 1) * roundDuration,
            "Round not over yet"
        );
        require(currentRound < memberList.length, "All rounds completed");

        uint256 totalContributions = roundTotalContributions[currentRound];

        if (totalContributions > 0) {
            address recipient = payoutOrder[currentRound];
            require(!members[recipient].hasReceived, "Recipient already paid");

            members[recipient].hasReceived = true;

            // Transfer funds to recipient
            (bool sent, ) = payable(recipient).call{value: totalContributions}(
                ""
            );
            require(sent, "Transfer failed");

            emit PayoutDistributed(recipient, totalContributions, currentRound);
        }

        // Track missed contributions for next round
        for (uint256 i = 0; i < memberList.length; i++) {
            address member = memberList[i];
            if (!roundContributions[currentRound][member]) {
                members[member].missedRounds++;
            }
        }

        currentRound++;

        if (currentRound >= memberList.length) {
            state = CircleState.Completed;
            emit CircleCompleted();
        }

        emit RoundAdvanced(currentRound);
    }

    // Emergency functions
    function emergencyWithdraw() external onlyAdmin {
        require(
            state == CircleState.Completed ||
                block.timestamp >
                startTime + (memberList.length + 1) * roundDuration,
            "Can only withdraw after completion or timeout"
        );

        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool sent, ) = payable(admin).call{value: balance}("");
            require(sent, "Emergency withdrawal failed");
        }
    }

    // View functions
    function getMembers() external view returns (address[] memory) {
        return memberList;
    }

    function getMemberInfo(
        address member
    ) external view returns (bool hasReceived, uint256 missedRounds) {
        Member memory m = members[member];
        return (m.hasReceived, m.missedRounds);
    }

    function timeLeftInRound() external view returns (uint256) {
        if (state != CircleState.Active || currentRound >= memberList.length)
            return 0;

        uint256 roundEndTime = startTime + (currentRound + 1) * roundDuration;
        if (block.timestamp >= roundEndTime) return 0;

        return roundEndTime - block.timestamp;
    }

    function getCurrentRoundInfo()
        external
        view
        returns (
            uint256 round,
            address recipient,
            uint256 totalContributed,
            uint256 contributorsCount
        )
    {
        if (state != CircleState.Active || currentRound >= memberList.length) {
            return (currentRound, address(0), 0, 0);
        }

        address currentRecipient = payoutOrder[currentRound];
        uint256 totalContrib = roundTotalContributions[currentRound];

        // Count contributors
        uint256 count = 0;
        for (uint256 i = 0; i < memberList.length; i++) {
            if (roundContributions[currentRound][memberList[i]]) {
                count++;
            }
        }

        return (currentRound, currentRecipient, totalContrib, count);
    }

    function hasContributedThisRound(
        address member
    ) external view returns (bool) {
        return roundContributions[currentRound][member];
    }

    function getCircleStatus()
        external
        view
        returns (
            CircleState circleState,
            uint256 totalMembers,
            uint256 round,
            uint256 timeLeft,
            uint256 contractBalance
        )
    {
        return (
            state,
            memberList.length,
            currentRound,
            this.timeLeftInRound(),
            address(this).balance
        );
    }

    // Remove the receive function to prevent accidental deposits
    // Users must call contribute() explicitly
}
