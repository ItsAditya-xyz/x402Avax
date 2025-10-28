// config/index.js

import { cookieStorage, createStorage, http } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { avalanche } from '@reown/appkit/networks';

// Get your project ID from https://cloud.reown.com
export const projectId = '82c551c51f3e1e15f15006db02e8eaa4';

if (!projectId) {
  throw new Error('Project ID is not defined');
}

export const networks = [avalanche];

// Create Wagmi adapter
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

// Export the Wagmi config
export const config = wagmiAdapter.wagmiConfig;
