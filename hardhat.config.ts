import type { HardhatUserConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { configVariable } from "hardhat/config";
import "dotenv/config";

const config: HardhatUserConfig = {
  plugins: [
    hardhatViem,
  ],
  solidity: {
    compilers: [
      {
        version: "0.8.25",
        settings: {
          optimizer: { enabled: true, runs: 10000 },
          evmVersion: "cancun"
        }
      },
      {
        version: "0.8.30",
        settings: {
          optimizer: { enabled: true, runs: 10000 },
          evmVersion: "cancun"
        }
      }
    ]
  },
  networks: {
    nttPrecompile: {
      type: "http",
      chainType: "l1",
      chainId: 788484,
      url: configVariable("RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")]
    }
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
