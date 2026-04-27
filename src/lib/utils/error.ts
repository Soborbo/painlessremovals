/**
 * ERROR UTILITIES
 *
 * Generate unique error IDs for tracking
 * User reports error ID, you find it in logs
 */

/**
 * Generate unique error ID
 */
export function generateErrorId(): string {
  return crypto.randomUUID().substring(0, 8);
}

/**
 * Format error for logging
 */
export function formatError(error: unknown, errorId: string): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorId,
      name: error.name,
      message: error.message,
      ...(import.meta.env.DEV && { stack: error.stack }),
    };
  }

  return {
    errorId,
    error: String(error),
  };
}

/**
 * Create error response with ID
 * Accepts optional CORS headers so error responses are readable cross-origin
 */
export function createErrorResponse(
  message: string,
  errorId: string,
  status = 500,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      errorId,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-ID': errorId,
        ...corsHeaders,
      },
    }
  );
}

/**
 * Custom error class with error ID
 */
export class AppError extends Error {
  public readonly errorId: string;
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.errorId = generateErrorId();
    this.statusCode = statusCode;
  }
}
