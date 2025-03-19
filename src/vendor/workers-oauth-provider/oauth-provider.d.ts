import { ExportedHandler, ExecutionContext } from '@cloudflare/workers-types';
import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Aliases for either type of Handler that makes .fetch required
 */
type ExportedHandlerWithFetch = ExportedHandler & Pick<Required<ExportedHandler>, 'fetch'>;
type WorkerEntrypointWithFetch = WorkerEntrypoint & Pick<Required<WorkerEntrypoint>, 'fetch'>;
/**
 * Configuration options for the OAuth Provider
 */
interface OAuthProviderOptions {
    /**
     * URL(s) for API routes. Requests with URLs starting with any of these prefixes
     * will be treated as API requests and require a valid access token.
     * Can be a single route or an array of routes. Each route can be a full URL or just a path.
     */
    apiRoute: string | string[];
    /**
     * Handler for API requests that have a valid access token.
     * This handler will receive the authenticated user properties in ctx.props.
     * Can be either an ExportedHandler object with a fetch method or a class extending WorkerEntrypoint.
     */
    apiHandler: ExportedHandlerWithFetch | (new (ctx: ExecutionContext, env: any) => WorkerEntrypointWithFetch);
    /**
     * Handler for all non-API requests or API requests without a valid token.
     * Can be either an ExportedHandler object with a fetch method or a class extending WorkerEntrypoint.
     */
    defaultHandler: ExportedHandler | (new (ctx: ExecutionContext, env: any) => WorkerEntrypointWithFetch);
    /**
     * URL of the OAuth authorization endpoint where users can grant permissions.
     * This URL is used in OAuth metadata and is not handled by the provider itself.
     */
    authorizeEndpoint: string;
    /**
     * URL of the token endpoint which the provider will implement.
     * This endpoint handles token issuance, refresh, and revocation.
     */
    tokenEndpoint: string;
    /**
     * Optional URL for the client registration endpoint.
     * If provided, the provider will implement dynamic client registration.
     */
    clientRegistrationEndpoint?: string;
    /**
     * Time-to-live for access tokens in seconds.
     * Defaults to 1 hour (3600 seconds) if not specified.
     */
    accessTokenTTL?: number;
    /**
     * List of scopes supported by this OAuth provider.
     * If not provided, the 'scopes_supported' field will be omitted from the OAuth metadata.
     */
    scopesSupported?: string[];
    /**
     * Controls whether the OAuth implicit flow is allowed.
     * This flow is discouraged in OAuth 2.1 due to security concerns.
     * Defaults to false.
     */
    allowImplicitFlow?: boolean;
    /**
     * Controls whether public clients (clients without a secret, like SPAs) can register via the
     * dynamic client registration endpoint. When true, only confidential clients can register.
     * Note: Creating public clients via the OAuthHelpers.createClient() method is always allowed.
     * Defaults to false.
     */
    disallowPublicClientRegistration?: boolean;
}
/**
 * Helper methods for OAuth operations provided to handler functions
 */
interface OAuthHelpers {
    /**
     * Parses an OAuth authorization request from the HTTP request
     * @param request - The HTTP request containing OAuth parameters
     * @returns The parsed authorization request parameters
     */
    parseAuthRequest(request: Request): Promise<AuthRequest>;
    /**
     * Looks up a client by its client ID
     * @param clientId - The client ID to look up
     * @returns A Promise resolving to the client info, or null if not found
     */
    lookupClient(clientId: string): Promise<ClientInfo | null>;
    /**
     * Completes an authorization request by creating a grant and authorization code
     * @param options - Options specifying the grant details
     * @returns A Promise resolving to an object containing the redirect URL
     */
    completeAuthorization(options: CompleteAuthorizationOptions): Promise<{
        redirectTo: string;
    }>;
    /**
     * Creates a new OAuth client
     * @param clientInfo - Partial client information to create the client with
     * @returns A Promise resolving to the created client info
     */
    createClient(clientInfo: Partial<ClientInfo>): Promise<ClientInfo>;
    /**
     * Lists all registered OAuth clients with pagination support
     * @param options - Optional pagination parameters (limit and cursor)
     * @returns A Promise resolving to the list result with items and optional cursor
     */
    listClients(options?: ListOptions): Promise<ListResult<ClientInfo>>;
    /**
     * Updates an existing OAuth client
     * @param clientId - The ID of the client to update
     * @param updates - Partial client information with fields to update
     * @returns A Promise resolving to the updated client info, or null if not found
     */
    updateClient(clientId: string, updates: Partial<ClientInfo>): Promise<ClientInfo | null>;
    /**
     * Deletes an OAuth client
     * @param clientId - The ID of the client to delete
     * @returns A Promise resolving when the deletion is confirmed.
     */
    deleteClient(clientId: string): Promise<void>;
    /**
     * Lists all authorization grants for a specific user with pagination support
     * Returns a summary of each grant without sensitive information
     * @param userId - The ID of the user whose grants to list
     * @param options - Optional pagination parameters (limit and cursor)
     * @returns A Promise resolving to the list result with grant summaries and optional cursor
     */
    listUserGrants(userId: string, options?: ListOptions): Promise<ListResult<GrantSummary>>;
    /**
     * Revokes an authorization grant
     * @param grantId - The ID of the grant to revoke
     * @param userId - The ID of the user who owns the grant
     * @returns A Promise resolving when the revocation is confirmed.
     */
    revokeGrant(grantId: string, userId: string): Promise<void>;
}
/**
 * Parsed OAuth authorization request parameters
 */
interface AuthRequest {
    /**
     * OAuth response type (e.g., "code" for authorization code flow)
     */
    responseType: string;
    /**
     * Client identifier for the OAuth client
     */
    clientId: string;
    /**
     * URL to redirect to after authorization
     */
    redirectUri: string;
    /**
     * Array of requested permission scopes
     */
    scope: string[];
    /**
     * Client state value to be returned in the redirect
     */
    state: string;
    /**
     * PKCE code challenge (RFC 7636)
     */
    codeChallenge?: string;
    /**
     * PKCE code challenge method (plain or S256)
     */
    codeChallengeMethod?: string;
}
/**
 * OAuth client registration information
 */
interface ClientInfo {
    /**
     * Unique identifier for the client
     */
    clientId: string;
    /**
     * Secret used to authenticate the client (stored as a hash)
     * Only present for confidential clients; undefined for public clients.
     */
    clientSecret?: string;
    /**
     * List of allowed redirect URIs for the client
     */
    redirectUris: string[];
    /**
     * Human-readable name of the client application
     */
    clientName?: string;
    /**
     * URL to the client's logo
     */
    logoUri?: string;
    /**
     * URL to the client's homepage
     */
    clientUri?: string;
    /**
     * URL to the client's privacy policy
     */
    policyUri?: string;
    /**
     * URL to the client's terms of service
     */
    tosUri?: string;
    /**
     * URL to the client's JSON Web Key Set for validating signatures
     */
    jwksUri?: string;
    /**
     * List of email addresses for contacting the client developers
     */
    contacts?: string[];
    /**
     * List of grant types the client supports
     */
    grantTypes?: string[];
    /**
     * List of response types the client supports
     */
    responseTypes?: string[];
    /**
     * Unix timestamp when the client was registered
     */
    registrationDate?: number;
    /**
     * The authentication method used by the client at the token endpoint.
     * Values include:
     * - 'client_secret_basic': Uses HTTP Basic Auth with client ID and secret (default for confidential clients)
     * - 'client_secret_post': Uses POST parameters for client authentication
     * - 'none': Used for public clients that can't securely store secrets (SPAs, mobile apps, etc.)
     *
     * Public clients use 'none', while confidential clients use either 'client_secret_basic' or 'client_secret_post'.
     */
    tokenEndpointAuthMethod: string;
}
/**
 * Options for completing an authorization request
 */
interface CompleteAuthorizationOptions {
    /**
     * The original parsed authorization request
     */
    request: AuthRequest;
    /**
     * Identifier for the user granting the authorization
     */
    userId: string;
    /**
     * Application-specific metadata to associate with this grant
     */
    metadata: any;
    /**
     * List of scopes that were actually granted (may differ from requested scopes)
     */
    scope: string[];
    /**
     * Application-specific properties to include with API requests
     * authorized by this grant
     */
    props: any;
}
/**
 * Authorization grant record
 */
interface Grant {
    /**
     * Unique identifier for the grant
     */
    id: string;
    /**
     * Client that received this grant
     */
    clientId: string;
    /**
     * User who authorized this grant
     */
    userId: string;
    /**
     * List of scopes that were granted
     */
    scope: string[];
    /**
     * Application-specific metadata associated with this grant
     */
    metadata: any;
    /**
     * Encrypted application-specific properties
     */
    encryptedProps: string;
    /**
     * Unix timestamp when the grant was created
     */
    createdAt: number;
    /**
     * The hash of the current refresh token associated with this grant
     */
    refreshTokenId?: string;
    /**
     * Wrapped encryption key for the current refresh token
     */
    refreshTokenWrappedKey?: string;
    /**
     * The hash of the previous refresh token associated with this grant
     * This token is still valid until the new token is first used
     */
    previousRefreshTokenId?: string;
    /**
     * Wrapped encryption key for the previous refresh token
     */
    previousRefreshTokenWrappedKey?: string;
    /**
     * The hash of the authorization code associated with this grant
     * Only present during the authorization code exchange process
     */
    authCodeId?: string;
    /**
     * Wrapped encryption key for the authorization code
     * Only present during the authorization code exchange process
     */
    authCodeWrappedKey?: string;
    /**
     * PKCE code challenge for this authorization
     * Only present during the authorization code exchange process
     */
    codeChallenge?: string;
    /**
     * PKCE code challenge method (plain or S256)
     * Only present during the authorization code exchange process
     */
    codeChallengeMethod?: string;
}
/**
 * Token record stored in KV
 * Note: The actual token format is "{userId}:{grantId}:{random-secret}"
 * but we still only store the hash of the full token string.
 * This contains only access tokens; refresh tokens are stored within the grant records.
 */
interface Token {
    /**
     * Unique identifier for the token (hash of the actual token)
     */
    id: string;
    /**
     * Identifier of the grant this token is associated with
     */
    grantId: string;
    /**
     * User ID associated with this token
     */
    userId: string;
    /**
     * Unix timestamp when the token was created
     */
    createdAt: number;
    /**
     * Unix timestamp when the token expires
     */
    expiresAt: number;
    /**
     * The encryption key for props, wrapped with this token
     */
    wrappedEncryptionKey: string;
    /**
     * Denormalized grant information for faster access
     */
    grant: {
        /**
         * Client that received this grant
         */
        clientId: string;
        /**
         * List of scopes that were granted
         */
        scope: string[];
        /**
         * Encrypted application-specific properties
         */
        encryptedProps: string;
    };
}
/**
 * Options for listing operations that support pagination
 */
interface ListOptions {
    /**
     * Maximum number of items to return (max 1000)
     */
    limit?: number;
    /**
     * Cursor for pagination (from a previous listing operation)
     */
    cursor?: string;
}
/**
 * Result of a listing operation with pagination support
 */
interface ListResult<T> {
    /**
     * The list of items
     */
    items: T[];
    /**
     * Cursor to get the next page of results, if there are more results
     */
    cursor?: string;
}
/**
 * Public representation of a grant, with sensitive data removed
 * Used for list operations where the complete grant data isn't needed
 */
interface GrantSummary {
    /**
     * Unique identifier for the grant
     */
    id: string;
    /**
     * Client that received this grant
     */
    clientId: string;
    /**
     * User who authorized this grant
     */
    userId: string;
    /**
     * List of scopes that were granted
     */
    scope: string[];
    /**
     * Application-specific metadata associated with this grant
     */
    metadata: any;
    /**
     * Unix timestamp when the grant was created
     */
    createdAt: number;
}
/**
 * OAuth 2.0 Provider implementation for Cloudflare Workers
 * Implements authorization code flow with support for refresh tokens
 * and dynamic client registration.
 */
declare class OAuthProvider {
    #private;
    /**
     * Creates a new OAuth provider instance
     * @param options - Configuration options for the provider
     */
    constructor(options: OAuthProviderOptions);
    /**
     * Main fetch handler for the Worker
     * Routes requests to the appropriate handler based on the URL
     * @param request - The HTTP request
     * @param env - Cloudflare Worker environment variables
     * @param ctx - Cloudflare Worker execution context
     * @returns A Promise resolving to an HTTP Response
     */
    fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response>;
}

export { type AuthRequest, type ClientInfo, type CompleteAuthorizationOptions, type Grant, type GrantSummary, type ListOptions, type ListResult, type OAuthHelpers, OAuthProvider, type OAuthProviderOptions, type Token, OAuthProvider as default };
