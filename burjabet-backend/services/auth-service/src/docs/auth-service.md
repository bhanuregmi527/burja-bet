# Frontend API Documentation - Auth Service

## Base URL
```
http://localhost:3001
```

## Authentication Flow

### Overview
The authentication system uses **Sign-In with Solana** (SIWS) pattern. Users sign a message with their Solana wallet to authenticate.

---

## 1. Login Endpoint

### `POST /login`

Authenticates a user using their Solana wallet signature.

### Request

#### Headers
```
Content-Type: application/json
```

#### Request Body

```typescript
{
  RequestHeader?: {
    RequestId?: string;        // Optional: Unique request identifier
    DeviceId?: string;         // Optional: Device identifier
    DeviceModel?: string;      // Optional: Device model
    Timestamp?: string;        // Optional: Request timestamp
    IpAddress?: string;        // Optional: IP address
    Location?: string;         // Optional: Location
  },
  Body: {
    walletAddress: string;     // Required: Solana wallet address (44 chars)
    signature: string;          // Required: Base64-encoded signature
    message: string;            // Required: Full signed message with timestamp
  }
}
```

#### Message Format
The `message` must follow this exact format:
```
Sign this message to authenticate with Burja Bet.

Wallet: {walletAddress}
Timestamp: {timestampInMilliseconds}
```

**Example:**
```
Sign this message to authenticate with Burja Bet.

Wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Timestamp: 1734177600000
```

#### JavaScript Example - Generating Message

```javascript
const generateLoginMessage = (walletAddress) => {
  const timestamp = Date.now();
  return `Sign this message to authenticate with Burja Bet.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
};

// Usage
const walletAddress = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const message = generateLoginMessage(walletAddress);

// Sign with wallet (using @solana/web3.js or wallet adapter)
const signature = await wallet.signMessage(new TextEncoder().encode(message));
const signatureBase64 = Buffer.from(signature).toString('base64');
```

#### Minimal Request (RequestHeader optional)

```json
{
  "Body": {
    "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "signature": "dGVzdF9zaWduYXR1cmU=",
    "message": "Sign this message to authenticate with Burja Bet.\n\nWallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\nTimestamp: 1734177600000"
  }
}
```

### Response

#### Success Response (200 OK)

```typescript
{
  ResponseHeader: {
    Status: "SUCCESS";
    StatusCode: "200";
    Message: "Operation completed successfully";
    TimeStamp: string;          // ISO 8601 timestamp
    RequestId: string;
    ResponseTitle: "Login Successful";
    ResponseDescription: "User authenticated successfully";
  },
  Response: {
    accessToken: string;         // JWT token (use for authenticated requests)
    user: {
      id: string;                // User UUID
      walletAddress: string;      // Solana wallet address
      balanceSol: string;         // Balance in SOL (decimal string)
      createdAt: string;         // ISO 8601 timestamp
    }
  }
}
```

#### Error Response (401 Unauthorized)

```typescript
{
  ResponseHeader: {
    Status: "ERROR";
    StatusCode: "401";
    Message: string;             // Error message
    TimeStamp: string;
    RequestId: string;
    ResponseTitle: "Authentication Error";
    ResponseDescription: string; // Detailed error description
  }
}
```

#### Common Error Messages

| Status Code | Error Message | Description |
|------------|---------------|-------------|
| 401 | `Message must contain a timestamp` | Message format is invalid |
| 401 | `Message expired. Please sign again.` | Timestamp is older than 5 minutes |
| 401 | `This signature has already been used` | Signature was already used (replay attack) |
| 401 | `Invalid signature format` | Signature is not valid base64 |
| 401 | `Invalid wallet address format` | Wallet address is not a valid Solana address |
| 401 | `Signature verification failed` | Signature doesn't match the message/wallet |

### Frontend Implementation Example

```typescript
// Using @solana/wallet-adapter-react
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';

const login = async () => {
  try {
    const { publicKey, signMessage } = useWallet();
    const walletAddress = publicKey?.toBase58();
    
    if (!walletAddress || !signMessage) {
      throw new Error('Wallet not connected');
    }

    // 1. Generate message with timestamp
    const timestamp = Date.now();
    const message = `Sign this message to authenticate with Burja Bet.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    
    // 2. Sign message
    const messageBytes = new TextEncoder().encode(message);
    const signature = await signMessage(messageBytes);
    const signatureBase64 = Buffer.from(signature).toString('base64');
    
    // 3. Send to backend
    const response = await fetch('http://localhost:3001/login', {
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
    
    if (response.ok) {
      // Store token
      localStorage.setItem('accessToken', data.Response.accessToken);
      localStorage.setItem('user', JSON.stringify(data.Response.user));
      return data;
    } else {
      throw new Error(data.ResponseHeader.Message);
    }
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};
```

---

## 2. Update User Profile Endpoint

### `POST /user/update`

Updates the authenticated user's profile information.

### Authentication

This endpoint requires authentication. Include the JWT token from login in the Authorization header:

```
Authorization: Bearer {accessToken}
```

### Request

#### Headers
```
Content-Type: application/json
Authorization: Bearer {accessToken}
```

#### Request Body

```typescript
{
  RequestHeader?: {
    RequestId?: string;
    DeviceId?: string;
    DeviceModel?: string;
    Timestamp?: string;
    IpAddress?: string;
    Location?: string;
  },
  Body: {
    username?: string;          // Optional: 3-50 chars, alphanumeric + underscore only
    fullname?: string;           // Optional: Max 100 chars
    profilePicture?: string;      // Optional: Profile picture URL
  }
}
```

#### Validation Rules

- **username**: 
  - 3-50 characters
  - Only alphanumeric characters and underscores (`a-z`, `A-Z`, `0-9`, `_`)
  - Must be unique
- **fullname**: 
  - Max 100 characters
- **profilePicture**: 
  - Valid URL string

#### Example Request

```json
{
  "Body": {
    "username": "john_doe",
    "fullname": "John Doe",
    "profilePicture": "https://example.com/avatar.jpg"
  }
}
```

### Response

#### Success Response (200 OK)

```typescript
{
  ResponseHeader: {
    Status: "SUCCESS";
    StatusCode: "200";
    Message: "Operation completed successfully";
    TimeStamp: string;
    RequestId: string;
    ResponseTitle: "User Updated";
    ResponseDescription: "User profile updated successfully";
  },
  Response: {
    id: string;                  // User UUID
    walletAddress: string;        // Solana wallet address
    balanceSol: string;          // Balance in SOL
    username: string | null;     // Username (if set)
    fullname: string | null;      // Full name (if set)
    inviteCode: string | null;   // Invite code
    profilePicture: string | null; // Profile picture URL
    twitter: {
      id: string;
      twitterId: string;
      name: string;
      displayName: string;
    } | null;                    // Twitter account (if linked)
    burjaPoints: number;         // Burja points
    createdAt: string;          // ISO 8601 timestamp
    updatedAt: string;          // ISO 8601 timestamp
  }
}
```

#### Error Responses

| Status Code | Error Message | Description |
|------------|---------------|-------------|
| 401 | `Authorization token not found` | Missing Authorization header |
| 401 | `Invalid or expired token` | JWT token is invalid or expired |
| 404 | `User not found` | User doesn't exist |
| 409 | `Username already taken` | Username is already in use |
| 400 | `Username must be at least 3 characters` | Username too short |
| 400 | `Username must be at most 50 characters` | Username too long |
| 400 | `Username can only contain letters, numbers, and underscores` | Invalid username format |
| 400 | `Full name must be at most 100 characters` | Full name too long |

### Frontend Implementation Example

```typescript
const updateUserProfile = async (updates: {
  username?: string;
  fullname?: string;
  profilePicture?: string;
}) => {
  try {
    const accessToken = localStorage.getItem('accessToken');
    
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('http://localhost:3001/user/update', {
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
    
    if (response.ok) {
      // Update stored user data
      localStorage.setItem('user', JSON.stringify(data.Response));
      return data;
    } else {
      throw new Error(data.ResponseHeader.Message);
    }
  } catch (error) {
    console.error('Update failed:', error);
    throw error;
  }
};

// Usage
await updateUserProfile({
  username: 'john_doe',
  fullname: 'John Doe',
  profilePicture: 'https://example.com/avatar.jpg',
});
```

---

## 3. Error Handling

### Standard Error Response Format

All errors follow this structure:

```typescript
{
  ResponseHeader: {
    Status: "ERROR";
    StatusCode: string;         // HTTP status code as string
    Message: string;             // Error message
    TimeStamp: string;           // ISO 8601 timestamp
    RequestId: string;           // Request ID (if provided)
    ResponseTitle: string;      // Error category
    ResponseDescription: string; // Detailed description
  }
}
```

### Frontend Error Handler

```typescript
const handleApiError = (error: any) => {
  if (error.ResponseHeader) {
    const { StatusCode, Message, ResponseDescription } = error.ResponseHeader;
    
    // Handle specific error codes
    switch (StatusCode) {
      case '401':
        // Unauthorized - redirect to login
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        break;
      case '409':
        // Conflict - show username taken message
        alert('Username already taken');
        break;
      default:
        // Show error message
        alert(ResponseDescription || Message);
    }
  } else {
    // Network or other errors
    console.error('API Error:', error);
    alert('An unexpected error occurred');
  }
};
```

---

## 4. Complete Authentication Flow

### Step-by-Step Flow

1. **User connects wallet** (using Solana wallet adapter)
2. **Generate login message** with current timestamp
3. **Sign message** with wallet
4. **Send login request** to `/login`
5. **Store JWT token** and user data
6. **Include token** in subsequent requests as `Authorization: Bearer {token}`

### Token Storage

```typescript
// After successful login
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('user', JSON.stringify(user));

// For authenticated requests
const token = localStorage.getItem('accessToken');
headers['Authorization'] = `Bearer ${token}`;
```

### Token Expiration

JWT tokens expire after **7 days** (configurable). Handle token expiration:

```typescript
// Check if token is expired
const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

// Refresh token or re-login
if (isTokenExpired(token)) {
  // Redirect to login or refresh token
  await login();
}
```

---

## 5. TypeScript Types

### Recommended Type Definitions

```typescript
// types/auth.ts

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

export interface LoginResponse {
  ResponseHeader: ResponseHeader;
  Response: {
    accessToken: string;
    user: {
      id: string;
      walletAddress: string;
      balanceSol: string;
      createdAt: string;
    };
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
```

---

## 6. Testing

### Using Postman

1. **Login Request:**
   - Method: `POST`
   - URL: `http://localhost:3001/login`
   - Body: See examples above

2. **Update User Request:**
   - Method: `POST`
   - URL: `http://localhost:3001/user/update`
   - Headers: `Authorization: Bearer {token}`
   - Body: See examples above

### Using Swagger UI

Visit `http://localhost:3001/api` for interactive API documentation and testing.

---

## 7. Notes

- **Message Timestamp**: Must be within 5 minutes of current time
- **Signature Reuse**: Each signature can only be used once (prevented by Redis)
- **Username Uniqueness**: Username must be unique across all users
- **JWT Expiration**: Tokens expire after 7 days (default)
- **CORS**: Enabled for all origins (development)

---

## Support

For issues or questions, contact the backend team or check the Swagger documentation at `/api`.

