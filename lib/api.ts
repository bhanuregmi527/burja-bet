// API utility functions for authentication and gameplay

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export interface RequestHeader {
  RequestId?: string;
  DeviceId?: string;
  DeviceModel?: string;
  Timestamp?: string;
  IpAddress?: string;
  Location?: string;
}

export interface ResponseHeader {
  Status: 'SUCCESS' | 'ERROR';
  StatusCode: string;
  Message: string;
  TimeStamp: string;
  RequestId: string;
  ResponseTitle: string;
  ResponseDescription: string;
}

export interface LoginRequestBody {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface LoginRequest {
  RequestHeader?: RequestHeader;
  Body: LoginRequestBody;
}

export interface LoginUser {
  id: string;
  walletAddress: string;
  balanceSol: string;
  createdAt: string;
}

export interface LoginResponse {
  ResponseHeader: ResponseHeader;
  Response: {
    accessToken: string;
    user: LoginUser;
  };
}

export interface UpdateUserRequestBody {
  username?: string;
  fullname?: string;
  profilePicture?: string;
}

export interface UpdateUserRequest {
  RequestHeader?: RequestHeader;
  Body: UpdateUserRequestBody;
}

export interface User {
  id: string;
  walletAddress: string;
  balanceSol: string;
  username: string | null;
  fullname: string | null;
  inviteCode: string | null;
  profilePicture: string | null;
  twitter: {
    id: string;
    twitterId: string;
    name: string;
    displayName: string;
  } | null;
  burjaPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserResponse {
  ResponseHeader: ResponseHeader;
  Response: User;
}

export interface ErrorResponse {
  ResponseHeader: ResponseHeader;
  Response?: any;
}

export interface PlaceBetRequestBody {
  amount: number;
  symbol: string;
}

export interface PlaceBetResponse {
  success: boolean;
  betId?: string;
  message: string;
}

/**
 * Generate login message with timestamp
 */
export const generateLoginMessage = (walletAddress: string): string => {
  const timestamp = Date.now();
  return `Sign this message to authenticate with Burja Bet.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
};

/**
 * Login with wallet signature
 */
export const login = async (
  walletAddress: string,
  signature: Uint8Array,
  message: string
): Promise<LoginResponse> => {
  // Convert signature to base64 (browser-compatible)
  const signatureBase64 = btoa(
    String.fromCharCode(...Array.from(signature))
  );

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Body: {
        walletAddress,
        signature: signatureBase64,
        message,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ErrorResponse = data;
    throw new Error(
      error.ResponseHeader?.Message || 'Login failed'
    );
  }

  return data as LoginResponse;
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  accessToken: string,
  updates: UpdateUserRequestBody
): Promise<UpdateUserResponse> => {
  const response = await fetch(`${API_BASE_URL}/user/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      Body: updates,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ErrorResponse = data;
    throw new Error(
      error.ResponseHeader?.Message || 'Update failed'
    );
  }

  return data as UpdateUserResponse;
};

/**
 * Place a bet via the gateway (JWT required)
 */
export const placeBet = async (
  accessToken: string,
  body: PlaceBetRequestBody,
): Promise<PlaceBetResponse> => {
  const response = await fetch(`${API_BASE_URL}/game/bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ErrorResponse = data;
    throw new Error(
      error.ResponseHeader?.Message || data?.message || 'Bet failed'
    );
  }

  // Gateway response is simple { success, betId, message }
  return data as PlaceBetResponse;
};

/**
 * Check if token is expired
 */
const decodeBase64Url = (input: string): string => {
  // JWT uses base64url encoding, not classic base64.
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
};

export const decodeJwtPayload = <T = any>(token: string): T | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as T;
  } catch {
    return null;
  }
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload: any = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

