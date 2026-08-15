/**
 * Helper utilities for building request/response headers (used for both HTTP and gRPC)
 */

export interface RequestHeader {
  RequestId: string;
  DeviceId: string;
  DeviceModel: string;
  Timestamp: string;
  IpAddress?: string;
  Location?: string;
}

export interface ResponseHeader {
  Status: string;
  StatusCode: string;
  Message: string;
  TimeStamp: string;
  RequestId: string;
  ResponseTitle: string;
  ResponseDescription: string;
}

/**
 * Build a success response header
 */
export function buildSuccessResponseHeader(
  requestId: string,
  title?: string,
  description?: string,
): ResponseHeader {
  return {
    Status: 'SUCCESS',
    StatusCode: '200',
    Message: 'Operation completed successfully',
    TimeStamp: new Date().toISOString(),
    RequestId: requestId,
    ResponseTitle: title || 'Success',
    ResponseDescription: description || 'The operation completed successfully',
  };
}

/**
 * Build an error response header
 */
export function buildErrorResponseHeader(
  requestId: string,
  statusCode: string,
  message: string,
  title?: string,
  description?: string,
): ResponseHeader {
  return {
    Status: 'ERROR',
    StatusCode: statusCode,
    Message: message,
    TimeStamp: new Date().toISOString(),
    RequestId: requestId,
    ResponseTitle: title || 'Error',
    ResponseDescription: description || message,
  };
}

/**
 * Extract request ID from request header
 */
export function getRequestId(header?: RequestHeader): string {
  return header?.RequestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

