import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { generateLoginMessage, login, isTokenExpired, type LoginUser } from '@/lib/api';

export function useAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && !isTokenExpired(storedToken)) {
      setAccessToken(storedToken);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    } else {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    }
  }, []);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!connected && user) {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    }
  }, [connected, user]);

  useEffect(() => {
    const handleLogin = async () => {
      // Don't auto-login if wallet was manually disconnected
      if (typeof window !== 'undefined' && sessionStorage.getItem('walletDisconnected') === 'true') {
        return;
      }

      if (!connected || !publicKey || !signMessage || isLoggingIn || user) {
        return;
      }

      try {
        setIsLoggingIn(true);
        const walletAddress = publicKey.toBase58();
        const message = generateLoginMessage(walletAddress);
        
        // Sign the message
        const messageBytes = new TextEncoder().encode(message);
        const signature = await signMessage(messageBytes);
        
        // Call login API
        const response = await login(walletAddress, signature, message);
        
        // Store token and user
        setAccessToken(response.Response.accessToken);
        setUser(response.Response.user);
        localStorage.setItem('accessToken', response.Response.accessToken);
        localStorage.setItem('user', JSON.stringify(response.Response.user));
        
        // Clear the disconnect flag after successful login
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('walletDisconnected');
        }
      } catch (error) {
        // Check if user rejected/cancelled the request
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isUserRejection = 
          errorMessage.includes('User rejected') ||
          errorMessage.includes('User cancelled') ||
          errorMessage.includes('rejected the request') ||
          errorMessage.includes('User denied');
        
        if (isUserRejection) {
          // Silently handle user rejection - disconnect wallet and return to main page
          console.log('User cancelled wallet signature');
          setIsLoggingIn(false);
          // Disconnect wallet so user can try again if they want
          if (disconnect) {
            await disconnect();
          }
          return;
        }
        
        // For other errors, log but don't show alert
        console.error('Login failed:', error);
      } finally {
        setIsLoggingIn(false);
      }
    };

    handleLogin();
  }, [connected, publicKey, signMessage, isLoggingIn, user]);

  const clearAuth = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  };

  return {
    user,
    accessToken,
    isLoggingIn,
    clearAuth,
  };
}

