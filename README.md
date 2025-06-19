# Tokenized Savings Circle (Ajo/Esusu/ROSCA)

A smart contract implementation of a traditional Rotating Savings and Credit Association (ROSCA), also known as Ajo in Nigeria, Esusu in Yoruba culture, or Tontine in other regions. This decentralized version brings transparency, automation, and trust to community savings circles.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Contract Architecture](#contract-architecture)
- [Deployment](#deployment)
- [Usage Guide](#usage-guide)
- [Security Features](#security-features)
- [Events](#events)
- [View Functions](#view-functions)
- [Emergency Functions](#emergency-functions)
- [Testing](#testing)
- [Gas Optimization](#gas-optimization)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Tokenized Savings Circle is a smart contract that automates the traditional community savings model where members contribute a fixed amount regularly, and each member receives the total pool once during the cycle. This eliminates the need for a trusted intermediary while maintaining the social and financial benefits of group savings.

### Traditional ROSCA vs Smart Contract

| Traditional ROSCA | Smart Contract ROSCA |
|-------------------|---------------------|
| Requires trusted organizer | Trustless execution |
| Manual record keeping | Automated tracking |
| Social pressure for compliance | Programmatic enforcement |
| Cash-based transactions | Cryptocurrency transactions |
| Limited transparency | Full transparency on blockchain |

## Features

- **Trustless Operation**: No central authority needed once deployed
- **Transparent Tracking**: All contributions and payouts recorded on-chain
- **Flexible Configuration**: Customizable contribution amounts, duration, and member limits
- **Automated Payouts**: Smart contract handles fund distribution
- **Member Management**: Join/leave functionality with proper validation
- **Reentrancy Protection**: Security measures against common attacks
- **Emergency Controls**: Admin functions for exceptional circumstances
- **Gas Optimized**: Efficient storage and computation patterns

## How It Works

### Circle Lifecycle

1. **Setup Phase**
   - Admin deploys contract with parameters (contribution amount, round duration, max members)
   - Contract state: `NotStarted`

2. **Member Registration**
   - Users call `joinCircle()` to become members
   - Maximum member limit enforced
   - Each member can only join once

3. **Circle Activation**
   - Admin calls `startCircle()` when minimum members reached
   - Payout order established (first-come-first-served)
   - Contract state: `Active`

4. **Contribution Rounds**
   - Each round lasts for specified duration
   - Members contribute exact amount via `contribute()`
   - Round automatically advances after duration expires

5. **Payout Distribution**
   - Admin calls `advanceRound()` to trigger payout
   - Current round's recipient receives all contributions
   - Missed contributions tracked for accountability

6. **Circle Completion**
   - After all members receive payout once
   - Contract state: `Completed`

### Example Scenario

**Setup**: 5 members, 1 RBTC per round, 7 days per round

- **Round 0**: All contribute 0.1 RBTC → Member A receives 0.5 RBTC
- **Round 1**: All contribute 0.1 RBTC → Member B receives 0.5 RBTC  
- **Round 2**: All contribute 0.1 RBTC → Member C receives 0.5 RBTC
- **Round 3**: All contribute 0.1 RBTC → Member D receives 0.5 RBTC
- **Round 4**: All contribute 0.1 RBTC → Member E receives 0.5 RBTC

Total: Each member contributes 0.5 RBTC and receives 0.5 RBTC over 5 rounds.

## Contract Architecture

### Core Components

```solidity
struct Member {
    address addr;           // Member's address
    bool hasReceived;      // Has received payout
    uint256 missedRounds;  // Number of missed contributions
}
```

### State Variables

- `admin`: Contract administrator
- `contributionAmount`: Fixed amount each member must contribute
- `roundDuration`: Duration of each round in seconds
- `maxMembers`: Maximum allowed members
- `currentRound`: Current active round number
- `state`: Circle state (NotStarted, Active, Completed)

### Key Mappings

- `members`: Member information by address
- `roundContributions`: Track contributions per round per member
- `roundTotalContributions`: Total contributions per round

## Deployment

### Prerequisites

- Solidity ^0.8.19
- Ethereum-compatible network
- Gas for deployment

### Constructor Parameters

```solidity
constructor(
    uint256 _contributionAmount,  // Wei amount for each contribution
    uint256 _roundDuration,       // Seconds per round
    uint256 _maxMembers          // Maximum members (2-50)
)
```

### Deployment Example

```javascript
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const SavingsCircleModule = buildModule("SavingsCircleModule", (m) => {
  // Deployment parameters
  const contributionAmount = m.getParameter("contributionAmount", "1000000000000000000"); 
  const roundDuration = m.getParameter("roundDuration", 604800); // 1 week in seconds (60 * 60 * 24 * 7)
  const maxMembers = m.getParameter("maxMembers", 10);

  // Deploy the SavingsCircle contract
  const savingsCircle = m.contract("SavingsCircle", [
    contributionAmount,
    roundDuration,
    maxMembers,
  ]);

  // Return the deployed contract for potential use in other modules
  return { savingsCircle };
});

module.exports = SavingsCircleModule;
```

## Usage Guide

### For Members

#### 1. Join Circle
```solidity
function joinCircle() external
```
- Can only join before circle starts
- One membership per address
- Must have available slots

#### 2. Make Contribution
```solidity
function contribute() external payable
```
- Must send exact `contributionAmount`
- Can only contribute once per round
- Must be called during active rounds

#### 3. Check Status
```solidity
// Check if you contributed this round
function hasContributedThisRound(address member) external view returns (bool)

// Get your member info
function getMemberInfo(address member) external view returns (bool hasReceived, uint256 missedRounds)
```

### For Admin

#### 1. Start Circle First
```solidity
function startCircle() external onlyAdmin
```
- Requires minimum 2 members
- Sets payout order
- Activates the circle

#### 2. Advance Rounds
```solidity
function advanceRound() external onlyAdmin
```
- Can only be called after round duration expires
- Distributes funds to current recipient
- Advances to next round

#### 3. Emergency Withdrawal
```solidity
function emergencyWithdraw() external onlyAdmin
```
- Only after circle completion or timeout
- Withdraws remaining contract balance

## Security Features

### Reentrancy Protection
- Manual reentrancy guard using `_locked` state variable
- Applied to critical functions (`contribute`, `advanceRound`)

### Access Control
- `onlyAdmin` modifier for administrative functions
- `onlyMember` modifier for member-only functions
- `circleActive` modifier for active circle operations

### Validation Checks
- Contribution amount validation
- Double-contribution prevention
- Member existence verification
- Round timing enforcement

### Safe Transfers
- Uses low-level `call` for ETH transfers
- Proper error handling for failed transfers
- No automatic receive function to prevent accidental deposits

## Events

```solidity
event MemberJoined(address indexed member);
event CircleStarted(uint256 startTime);
event ContributionMade(address indexed member, uint256 amount, uint256 round);
event PayoutDistributed(address indexed recipient, uint256 amount, uint256 round);
event RoundAdvanced(uint256 newRound);
event CircleCompleted();
```

## View Functions

### Circle Information
```solidity
function getCircleStatus() external view returns (
    CircleState circleState,
    uint256 totalMembers,
    uint256 round,
    uint256 timeLeft,
    uint256 contractBalance
)
```

### Round Information
```solidity
function getCurrentRoundInfo() external view returns (
    uint256 round,
    address recipient,
    uint256 totalContributed,
    uint256 contributorsCount
)
```

### Time Management
```solidity
function timeLeftInRound() external view returns (uint256)
```

### Member Management
```solidity
function getMembers() external view returns (address[] memory)
function getMemberInfo(address member) external view returns (bool, uint256)
```

## Emergency Functions

### Emergency Withdrawal
- **Purpose**: Recover funds after circle completion or timeout
- **Access**: Admin only
- **Conditions**: Circle completed OR exceeded timeout period
- **Use Cases**: 
  - Recover unclaimed funds
  - Handle incomplete circles
  - Address technical issues

## Testing

### Test Scenarios

1. **Happy Path**
   - Full circle completion with all members participating

2. **Edge Cases**
   - Member joins and immediately leaves
   - Partial contributions in rounds
   - Circle timeout scenarios

3. **Security Tests**
   - Reentrancy attack attempts
   - Unauthorized access attempts
   - Double spending attempts

### Sample Test Structure

```javascript
describe("SavingsCircle", function() {
    it("Should allow members to join before start", async function() {
        await circle.connect(member1).joinCircle();
        const members = await circle.getMembers();
        expect(members).to.include(member1.address);
    });
    
    it("Should distribute funds correctly", async function() {
        // Test contribution and payout logic
    });
    
    it("Should prevent reentrancy attacks", async function() {
        // Test reentrancy protection
    });
});
```

## Gas Optimization

### Design Decisions

- **Member limit**: Maximum 50 members to prevent excessive gas costs
- **Packed structs**: Efficient storage layout
- **Minimal loops**: Limited iteration over member arrays  
- **Event-based tracking**: Offload computation to event logs where possible

### Gas Estimates

| Function | Estimated Gas |
|----------|---------------|
| `joinCircle()` | ~50,000 |
| `contribute()` | ~30,000 |
| `advanceRound()` | ~100,000 + (members × 5,000) |
| `startCircle()` | ~40,000 |

## Limitations

### Technical Limitations
- **Fixed contribution amounts**: Cannot change once deployed
- **No early exit**: Members cannot leave once circle starts
- **Admin dependency**: Requires admin to advance rounds
- **Gas costs**: Large circles may have high gas costs for round advancement

### Economic Considerations
- **No interest**: Funds don't earn yield while in contract
- **Ethereum fees**: Network fees may be significant for small contributions
- **Price volatility**: ETH price changes affect real value of contributions

### Operational Constraints
- **Time-based rounds**: Cannot advance rounds early even if all contributed
- **All-or-nothing**: Partial contributions not accepted
- **Sequential payouts**: Cannot change payout order once started

## Contributing

### Development Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Run tests: `npx hardhat test`
4. Deploy locally: `npx hardhat run scripts/deploy.js`

### Contribution Guidelines

- Follow Solidity style guide
- Add comprehensive tests for new features
- Update documentation
- Ensure gas optimization
- Maintain security best practices

### Future Enhancements

- **Automated round advancement**: Time-based automation using Chainlink Keepers
- **Flexible contributions**: Variable contribution amounts
- **Interest earning**: Integration with DeFi protocols
- **Multi-token support**: Support for ERC-20 tokens
- **Governance features**: Member voting on circle parameters

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Additional Resources

- [ROSCA Wikipedia](https://en.wikipedia.org/wiki/Rotating_savings_and_credit_association)
- [Ethereum Smart Contract Security](https://consensys.github.io/smart-contract-best-practices/)
- [Solidity Documentation](https://docs.soliditylang.org/)

---

**Disclaimer**: This smart contract is provided as-is for educational and experimental purposes. Always conduct thorough testing and security audits before using in production environments. The developers are not responsible for any losses incurred through the use of this contract.