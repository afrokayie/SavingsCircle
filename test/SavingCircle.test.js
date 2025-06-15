const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SavingsCircle", function () {
  let savingsCircle;
  let admin, member1, member2, member3, member4, nonMember;
  let contributionAmount = ethers.parseEther("1"); // 1 ETH
  let roundDuration = 60 * 60 * 24 * 7; // 1 week in seconds
  let maxMembers = 4;

  beforeEach(async function () {
    [admin, member1, member2, member3, member4, nonMember] = await ethers.getSigners();
    
    const SavingsCircle = await ethers.getContractFactory("SavingsCircle");
    savingsCircle = await SavingsCircle.deploy(contributionAmount, roundDuration, maxMembers);
    await savingsCircle.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct admin", async function () {
      expect(await savingsCircle.admin()).to.equal(admin.address);
    });

    it("Should set the correct parameters", async function () {
      expect(await savingsCircle.contributionAmount()).to.equal(contributionAmount);
      expect(await savingsCircle.roundDuration()).to.equal(roundDuration);
      expect(await savingsCircle.maxMembers()).to.equal(maxMembers);
    });

    it("Should start in NotStarted state", async function () {
      const status = await savingsCircle.getCircleStatus();
      expect(status.circleState).to.equal(0); // NotStarted
    });
  });

  describe("Joining Circle", function () {
    it("Should allow members to join", async function () {
      await expect(savingsCircle.connect(member1).joinCircle())
        .to.emit(savingsCircle, "MemberJoined")
        .withArgs(member1.address);

      const members = await savingsCircle.getMembers();
      expect(members).to.include(member1.address);
    });

    it("Should not allow duplicate joins", async function () {
      await savingsCircle.connect(member1).joinCircle();
      
      await expect(savingsCircle.connect(member1).joinCircle())
        .to.be.revertedWith("Already joined");
    });

    it("Should not allow joining after circle is full", async function () {
      // Fill the circle
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.connect(member3).joinCircle();
      await savingsCircle.connect(member4).joinCircle();

      await expect(savingsCircle.connect(nonMember).joinCircle())
        .to.be.revertedWith("Circle full");
    });

    it("Should not allow joining after circle has started", async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.startCircle();

      await expect(savingsCircle.connect(member3).joinCircle())
        .to.be.revertedWith("Circle already started");
    });
  });

  describe("Starting Circle", function () {
    beforeEach(async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.connect(member3).joinCircle();
    });

    it("Should allow admin to start circle", async function () {
      await expect(savingsCircle.startCircle())
        .to.emit(savingsCircle, "CircleStarted");

      const status = await savingsCircle.getCircleStatus();
      expect(status.circleState).to.equal(1); // Active
    });

    it("Should not allow non-admin to start circle", async function () {
      await expect(savingsCircle.connect(member1).startCircle())
        .to.be.revertedWith("Only admin can call this");
    });

    it("Should not allow starting with less than 2 members", async function () {
      const SavingsCircle = await ethers.getContractFactory("SavingsCircle");
      const newCircle = await SavingsCircle.deploy(contributionAmount, roundDuration, maxMembers);
      await newCircle.waitForDeployment();

      await newCircle.connect(member1).joinCircle();

      await expect(newCircle.startCircle())
        .to.be.revertedWith("Need at least 2 members to start");
    });

    it("Should not allow starting twice", async function () {
      await savingsCircle.startCircle();

      await expect(savingsCircle.startCircle())
        .to.be.revertedWith("Already started");
    });
  });

  describe("Contributing", function () {
    beforeEach(async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.connect(member3).joinCircle();
      await savingsCircle.startCircle();
    });

    it("Should allow members to contribute correct amount", async function () {
      await expect(savingsCircle.connect(member1).contribute({ value: contributionAmount }))
        .to.emit(savingsCircle, "ContributionMade")
        .withArgs(member1.address, contributionAmount, 0);

      expect(await savingsCircle.hasContributedThisRound(member1.address)).to.be.true;
    });

    it("Should reject incorrect contribution amount", async function () {
      const wrongAmount = ethers.parseEther("0.5");
      
      await expect(savingsCircle.connect(member1).contribute({ value: wrongAmount }))
        .to.be.revertedWith("Incorrect contribution amount");
    });

    it("Should not allow duplicate contributions in same round", async function () {
      await savingsCircle.connect(member1).contribute({ value: contributionAmount });

      await expect(savingsCircle.connect(member1).contribute({ value: contributionAmount }))
        .to.be.revertedWith("Already contributed this round");
    });

    it("Should not allow non-members to contribute", async function () {
      await expect(savingsCircle.connect(nonMember).contribute({ value: contributionAmount }))
        .to.be.revertedWith("Not a member");
    });

    it("Should track round contributions correctly", async function () {
      await savingsCircle.connect(member1).contribute({ value: contributionAmount });
      await savingsCircle.connect(member2).contribute({ value: contributionAmount });

      const roundInfo = await savingsCircle.getCurrentRoundInfo();
      expect(roundInfo.totalContributed).to.equal(contributionAmount * 2n);
      expect(roundInfo.contributorsCount).to.equal(2);
    });
  });

  describe("Round Management", function () {
    beforeEach(async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.connect(member3).joinCircle();
      await savingsCircle.startCircle();
    });

    it("Should not allow advancing round before time is up", async function () {
      await expect(savingsCircle.advanceRound())
        .to.be.revertedWith("Round not over yet");
    });

    it("Should allow advancing round after time is up", async function () {
      // Make contributions
      await savingsCircle.connect(member1).contribute({ value: contributionAmount });
      await savingsCircle.connect(member2).contribute({ value: contributionAmount });
      await savingsCircle.connect(member3).contribute({ value: contributionAmount });

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [roundDuration]);
      await ethers.provider.send("evm_mine");

      const initialBalance = await ethers.provider.getBalance(member1.address);
      
      await expect(savingsCircle.advanceRound())
        .to.emit(savingsCircle, "PayoutDistributed")
        .and.to.emit(savingsCircle, "RoundAdvanced");

      // Check that first member received payout
      const finalBalance = await ethers.provider.getBalance(member1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should track missed contributions", async function () {
      // Only member1 and member2 contribute
      await savingsCircle.connect(member1).contribute({ value: contributionAmount });
      await savingsCircle.connect(member2).contribute({ value: contributionAmount });

      // Fast forward and advance round
      await ethers.provider.send("evm_increaseTime", [roundDuration]);
      await ethers.provider.send("evm_mine");
      await savingsCircle.advanceRound();

      // Check missed rounds
      const member3Info = await savingsCircle.getMemberInfo(member3.address);
      expect(member3Info.missedRounds).to.equal(1);
    });

    it("Should complete circle after all rounds", async function () {
      // Go through all rounds
      for (let round = 0; round < 3; round++) {
        await savingsCircle.connect(member1).contribute({ value: contributionAmount });
        await savingsCircle.connect(member2).contribute({ value: contributionAmount });
        await savingsCircle.connect(member3).contribute({ value: contributionAmount });

        await ethers.provider.send("evm_increaseTime", [roundDuration]);
        await ethers.provider.send("evm_mine");
        
        if (round === 2) {
          await expect(savingsCircle.advanceRound())
            .to.emit(savingsCircle, "CircleCompleted");
        } else {
          await savingsCircle.advanceRound();
        }
      }

      const status = await savingsCircle.getCircleStatus();
      expect(status.circleState).to.equal(2); // Completed
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.startCircle();
    });

    it("Should return correct member list", async function () {
      const members = await savingsCircle.getMembers();
      expect(members).to.have.length(2);
      expect(members).to.include(member1.address);
      expect(members).to.include(member2.address);
    });

    it("Should return correct member info", async function () {
      const memberInfo = await savingsCircle.getMemberInfo(member1.address);
      expect(memberInfo.hasReceived).to.be.false;
      expect(memberInfo.missedRounds).to.equal(0);
    });

    it("Should return correct time left in round", async function () {
      const timeLeft = await savingsCircle.timeLeftInRound();
      expect(timeLeft).to.be.gt(0);
      expect(timeLeft).to.be.lte(roundDuration);
    });

    it("Should return correct circle status", async function () {
      const status = await savingsCircle.getCircleStatus();
      expect(status.circleState).to.equal(1); // Active
      expect(status.totalMembers).to.equal(2);
      expect(status.round).to.equal(0);
    });
  });

  describe("Emergency Functions", function () {
    beforeEach(async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.startCircle();
      
      // Add some funds to contract
      await savingsCircle.connect(member1).contribute({ value: contributionAmount });
      await savingsCircle.connect(member2).contribute({ value: contributionAmount });
    });

    it("Should not allow emergency withdrawal before timeout", async function () {
      await expect(savingsCircle.emergencyWithdraw())
        .to.be.revertedWith("Can only withdraw after completion or timeout");
    });

    it("Should allow emergency withdrawal after timeout", async function () {
      // Fast forward past all rounds + 1 extra round
      await ethers.provider.send("evm_increaseTime", [roundDuration * 3]);
      await ethers.provider.send("evm_mine");

      const initialBalance = await ethers.provider.getBalance(admin.address);
      const contractBalance = await ethers.provider.getBalance(savingsCircle.target);

      await savingsCircle.emergencyWithdraw();

      const finalBalance = await ethers.provider.getBalance(admin.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should only allow admin to emergency withdraw", async function () {
      await ethers.provider.send("evm_increaseTime", [roundDuration * 3]);
      await ethers.provider.send("evm_mine");

      await expect(savingsCircle.connect(member1).emergencyWithdraw())
        .to.be.revertedWith("Only admin can call this");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero contribution rounds", async function () {
      await savingsCircle.connect(member1).joinCircle();
      await savingsCircle.connect(member2).joinCircle();
      await savingsCircle.startCircle();

      // Don't contribute anything
      await ethers.provider.send("evm_increaseTime", [roundDuration]);
      await ethers.provider.send("evm_mine");

      // Should still advance round even with no contributions
      await expect(savingsCircle.advanceRound())
        .to.emit(savingsCircle, "RoundAdvanced");
    });

    it("Should handle contract with maximum members", async function () {
      const SavingsCircle = await ethers.getContractFactory("SavingsCircle");
      const maxCircle = await SavingsCircle.deploy(contributionAmount, roundDuration, 50);
      await maxCircle.waitForDeployment();

      // Should handle max members without gas issues
      const signers = await ethers.getSigners();
      for (let i = 0; i < 10; i++) {
        await maxCircle.connect(signers[i]).joinCircle();
      }

      expect((await maxCircle.getMembers()).length).to.equal(10);
    });
  });
});