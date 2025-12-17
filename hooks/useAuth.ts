"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { decodeJwtPayload, generateLoginMessage, login, isTokenExpired, type LoginUser } from '@/lib/api';

type AuthContextValue = {
  user: LoginUser | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  loginWithWallet: () => Promise<void>;
  clearAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useProvideAuth(): AuthContextValue {
  const { publicKey, signMessage, connected } = useWallet();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const loginAttemptedRef = useRef<string | null>(null);
  const wasConnectedRef = useRef(false);

  const clearAuth = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  };

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
    setAuthHydrated(true);
  }, []);

  // Clear auth when wallet disconnects
  useEffect(() => {
    // On initial page load, wallet adapters often report connected=false briefly.
    // Only treat "connected -> disconnected" as a real disconnect event.
    if (connected) {
      wasConnectedRef.current = true;
      return;
    }

    if (wasConnectedRef.current) {
      // Real disconnect (was connected in this session, now not connected)
      clearAuth();
      loginAttemptedRef.current = null;
      wasConnectedRef.current = false;
    } else {
      // Not connected yet (initial load) — don't clear stored session.
      loginAttemptedRef.current = null;
    }
  }, [connected, user]);

  // If wallet changes, ensure any stored token matches the connected wallet.
  useEffect(() => {
    if (!connected || !publicKey || !accessToken) return;
    const payload = decodeJwtPayload<any>(accessToken);
    const tokenWallet = payload?.walletAddress;
    const currentWallet = publicKey.toBase58();
    if (typeof tokenWallet === 'string' && tokenWallet !== currentWallet) {
      clearAuth();
      loginAttemptedRef.current = null;
    }
  }, [connected, publicKey, accessToken]);

  const loginWithWallet = async () => {
    // Never auto-trigger signing on page load; call this only from explicit user actions.
    if (typeof window !== 'undefined' && sessionStorage.getItem('walletDisconnected') === 'true') {
      throw new Error('Wallet was disconnected. Please connect again.');
    }

    // Wait until we have restored any existing session from localStorage.
    if (!authHydrated) return;

    if (!connected || !publicKey || !signMessage) {
      throw new Error('Connect wallet to sign in');
    }

    if (accessToken && !isTokenExpired(accessToken)) {
      return;
    }

    const currentWallet = publicKey.toBase58();
    if (loginAttemptedRef.current === currentWallet) return;

    try {
      setIsLoggingIn(true);
      const walletAddress = publicKey.toBase58();
      const message = generateLoginMessage(walletAddress);
      loginAttemptedRef.current = walletAddress;

      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);

      const response = await login(walletAddress, signature, message);

      setAccessToken(response.Response.accessToken);
      setUser(response.Response.user);
      localStorage.setItem('accessToken', response.Response.accessToken);
      localStorage.setItem('user', JSON.stringify(response.Response.user));

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('walletDisconnected');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return {
    user,
    accessToken,
    isLoggingIn,
    loginWithWallet,
    clearAuth,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAuth();
  // Avoid JSX here because this file is `.ts` (not `.tsx`).
  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}

