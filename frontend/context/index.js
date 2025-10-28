// context/index.js
'use client';

import { wagmiAdapter, projectId } from '../config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { avalanche } from '@reown/appkit/networks';
import React from 'react';
import { cookieToInitialState, WagmiProvider } from 'wagmi';

// Create React Query client
const queryClient = new QueryClient();

if (!projectId) {
  throw new Error('Project ID is not defined');
}

const metadata = {
  name: 'Papex',
  description: 'Tournament Trading App',
  url: 'https://yourdomain.com', // must match deployed domain
  icons: ['https://yourdomain.com/logo.png'],
};

// Initialize AppKit modal
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [avalanche],
  defaultNetwork: avalanche,
  metadata,
  features: {
    analytics: true,
  },
});

export default function ContextProvider({ children, cookies }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
