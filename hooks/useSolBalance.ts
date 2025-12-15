import { useEffect, useState, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function useSolBalance() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopPollingRef = useRef(false);

  useEffect(() => {
    if (!publicKey || !connection) {
      setBalance(null);
      return;
    }

    // Reset stop polling flag when wallet changes
    stopPollingRef.current = false;

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        const newBalance = lamports / LAMPORTS_PER_SOL;
        setBalance(newBalance);
      } catch (error) {
        console.error('Error fetching balance:', error);
        // Don't update balance on error, keep previous value
      }
    };

    // Initial fetch (only show loading on first load)
    fetchBalance();

    // Subscribe to balance changes (real-time updates)
    const subscriptionId = connection.onAccountChange(
      publicKey,
      (accountInfo) => {
        const newBalance = accountInfo.lamports / LAMPORTS_PER_SOL;
        setBalance(newBalance);
      }
    );

    // Poll for balance updates less frequently (every 30 seconds) and stop after 5 minutes
    let pollCount = 0;
    const maxPolls = 10; // 10 polls * 30 seconds = 5 minutes
    
    const pollBalance = () => {
      if (stopPollingRef.current || pollCount >= maxPolls) {
        return;
      }
      
      pollCount++;
      fetchBalance(); // Silent fetch
      
      if (pollCount < maxPolls) {
        pollingTimeoutRef.current = setTimeout(pollBalance, 30000); // 30 seconds
      }
    };

    // Start polling after 30 seconds
    pollingTimeoutRef.current = setTimeout(pollBalance, 30000);

    return () => {
      stopPollingRef.current = true;
      connection.removeAccountChangeListener(subscriptionId);
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [publicKey, connection]);

  return { balance, loading: false };
}

