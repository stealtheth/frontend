import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrum, base, mainnet, optimism, polygon } from 'wagmi/chains';
import { title } from './constants';
import { http } from 'viem';

const DRPC_API_KEY = import.meta.env.VITE_DRPC_API_KEY;
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

function drpcUrl(drpcChain: string) {
  return DRPC_API_KEY ? `https://lb.drpc.org/ogrpc?network=${drpcChain}&dkey=${DRPC_API_KEY}` : undefined;
}

export const config = getDefaultConfig({
  appName: title,
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [mainnet, polygon, optimism, arbitrum, base],
  transports: {
    [mainnet.id]: http(drpcUrl('ethereum')),
    [polygon.id]: http(drpcUrl('polygon')),
    [optimism.id]: http(drpcUrl('optimism')),
    [arbitrum.id]: http(drpcUrl('arbitrum')),
    [base.id]: http(drpcUrl('base')),
  },
  ssr: false,
});
