const { ethers } = require("ethers");

const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "uint256", "uint256"],
  [
    ethers.parseEther("0.1"), // 100000000000000000
    604800,                   // 1 week in seconds
    10                        // maxMembers
  ]
);

console.log("Encoded constructor args:");
console.log(encoded);
