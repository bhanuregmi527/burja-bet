"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Wallet, ChevronDown, LogOut, Copy, Check, CheckCircle2 } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/hooks/useAuth';
import { useSolBalance } from '@/hooks/useSolBalance';

export function WalletButton() {
  const { publicKey, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, isLoggingIn, clearAuth } = useAuth();
  const { balance } = useSolBalance();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDisconnectSuccess, setShowDisconnectSuccess] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside both the dropdown and the button
      const dropdownElement = document.querySelector('[data-wallet-dropdown]');
      const isClickInsideDropdown = dropdownElement && dropdownElement.contains(target);
      const isClickInsideButton = buttonRef.current && buttonRef.current.contains(target);
      
      if (!isClickInsideDropdown && !isClickInsideButton) {
        setShowDropdown(false);
      }
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleClick = async () => {
    if (connected && user) {
      // Calculate dropdown position before showing
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 8,
          right: window.innerWidth - rect.right,
        });
      }
      // Toggle dropdown when connected
      setShowDropdown(!showDropdown);
    } else {
      // Clear disconnect flag when user manually connects
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('walletDisconnected');
      }
      // Open wallet modal when not connected
      setVisible(true);
    }
  };

  const handleDisconnect = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setShowDropdown(false);
    
    // Set a flag to prevent auto-login after disconnect
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('walletDisconnected', 'true');
    }
    
    // Clear auth state immediately - this will update UI right away
    clearAuth();
    
    // Disconnect wallet
    try {
      if (disconnect && typeof disconnect === 'function') {
        await disconnect();
      }
      
      // Also try disconnecting via wallet adapter directly
      if (wallet?.adapter && typeof wallet.adapter.disconnect === 'function') {
        await wallet.adapter.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
    
    // Clear wallet adapter's localStorage to prevent auto-reconnect
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('walletName');
        // Clear common wallet adapter storage keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('wallet') || key.includes('phantom') || key.includes('solflare'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (storageError) {
        // Ignore storage errors
      }
    }
    
    // Show success notification
    setShowDisconnectSuccess(true);
    setTimeout(() => {
      setShowDisconnectSuccess(false);
    }, 3000);
  };

  const getButtonText = () => {
    if (connecting) return 'Connecting...';
    if (isLoggingIn) return 'Signing in...';
    if (connected && user && publicKey) {
      return `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;
    }
    return 'Connect Wallet';
  };

  const formatBalance = (bal: number | null) => {
    if (bal === null) return '0.00';
    return bal.toFixed(2);
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!publicKey) return;
    
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  return (
    <>
      {/* Disconnect Success Notification */}
      {showDisconnectSuccess && typeof window !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 z-[999999] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 rounded-xl border border-[#14F195]/50 bg-[#0b1120] px-4 py-3 shadow-2xl backdrop-blur-xl">
            <CheckCircle2 className="h-5 w-5 text-[#14F195]" />
            <span className="text-sm font-semibold text-white">Wallet disconnected successfully</span>
          </div>
        </div>,
        document.body
      )}

      <div className="relative flex items-center gap-3" ref={dropdownRef}>
        {/* SOL Balance Display - Only show when connected and logged in */}
        {connected && user && (
          <div className="flex items-center gap-2 rounded-full border border-[#14F195]/50 bg-[#14F195]/10 px-3 py-1.5 text-sm shadow-[0_0_12px_rgba(20,241,149,0.3)]">
            <span className="text-xs text-[#14F195] font-semibold">SOL</span>
            <span className="font-semibold text-[#14F195]" style={{ fontFamily: "var(--font-jetbrains)" }}>
              {balance !== null ? formatBalance(balance) : '0.00'}
            </span>
          </div>
        )}

        {/* Wallet Button */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={handleClick}
            disabled={connecting || isLoggingIn}
            className="group relative overflow-hidden rounded-full border border-[#14F195]/50 bg-[#14F195]/10 px-4 py-2 text-sm font-semibold text-[#14F195] shadow-[0_0_16px_rgba(20,241,149,0.4)] transition hover:border-[#14F195] hover:bg-[#14F195]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="relative z-10 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {getButtonText()}
              {connected && user && (
                <ChevronDown className={`h-3 w-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              )}
            </span>
            <span className="absolute inset-0 -z-10 bg-gradient-to-r from-[#14F195]/30 via-transparent to-[#9945FF]/30 blur-xl transition duration-300 group-hover:opacity-80" />
          </button>
        </div>

      {/* Dropdown Menu - Rendered via Portal */}
      {showDropdown && connected && user && typeof window !== 'undefined' && createPortal(
        <div 
          data-wallet-dropdown
          className="fixed w-56 rounded-xl border border-white/10 bg-[#0b1120] shadow-2xl backdrop-blur-xl z-[99999]"
          style={{
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2">
            <div className="px-3 py-2 border-b border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300 font-mono">
                  {publicKey ? formatAddress(publicKey.toBase58()) : ''}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[#14F195] hover:bg-white/5 rounded transition"
                  title="Copy address"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span className="text-[#14F195]">Copied!</span>
                    </>
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 rounded-lg transition mt-1"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>,
        document.body
      )}
      </div>
    </>
  );
}

