const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const SavingsCircleModule = buildModule("SavingsCircleModule", (m) => {
  // Deployment parameters
  const contributionAmount = m.getParameter("contributionAmount", "1000000000000000000"); // 1 ETH in wei
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