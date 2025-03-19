var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

// src/oauth-provider.ts
import { WorkerEntrypoint } from "cloudflare:workers";
var _impl;
var OAuthProvider = class {
  /**
   * Creates a new OAuth provider instance
   * @param options - Configuration options for the provider
   */
  constructor(options) {
    __privateAdd(this, _impl);
    __privateSet(this, _impl, new OAuthProviderImpl(options));
  }
  /**
   * Main fetch handler for the Worker
   * Routes requests to the appropriate handler based on the URL
   * @param request - The HTTP request
   * @param env - Cloudflare Worker environment variables
   * @param ctx - Cloudflare Worker execution context
   * @returns A Promise resolving to an HTTP Response
   */
  fetch(request, env, ctx) {
    return __privateGet(this, _impl).fetch(request, env, ctx);
  }
};
_impl = new WeakMap();
var OAuthProviderImpl = class {
  /**
   * Creates a new OAuth provider instance
   * @param options - Configuration options for the provider
   */
  constructor(options) {
    this.typedApiHandler = this.validateHandler(options.apiHandler, "apiHandler");
    this.typedDefaultHandler = this.validateHandler(options.defaultHandler, "defaultHandler");
    if (Array.isArray(options.apiRoute)) {
      options.apiRoute.forEach((route, index) => {
        this.validateEndpoint(route, `apiRoute[${index}]`);
      });
    } else {
      this.validateEndpoint(options.apiRoute, "apiRoute");
    }
    this.validateEndpoint(options.authorizeEndpoint, "authorizeEndpoint");
    this.validateEndpoint(options.tokenEndpoint, "tokenEndpoint");
    if (options.clientRegistrationEndpoint) {
      this.validateEndpoint(options.clientRegistrationEndpoint, "clientRegistrationEndpoint");
    }
    this.options = {
      ...options,
      accessTokenTTL: options.accessTokenTTL || DEFAULT_ACCESS_TOKEN_TTL
    };
  }
  /**
   * Validates that an endpoint is either an absolute path or a full URL
   * @param endpoint - The endpoint to validate
   * @param name - The name of the endpoint property for error messages
   * @throws TypeError if the endpoint is invalid
   */
  validateEndpoint(endpoint, name) {
    if (this.isPath(endpoint)) {
      if (!endpoint.startsWith("/")) {
        throw new TypeError(`${name} path must be an absolute path starting with /`);
      }
    } else {
      try {
        new URL(endpoint);
      } catch (e) {
        throw new TypeError(`${name} must be either an absolute path starting with / or a valid URL`);
      }
    }
  }
  /**
   * Validates that a handler is either an ExportedHandler or a class extending WorkerEntrypoint
   * @param handler - The handler to validate
   * @param name - The name of the handler property for error messages
   * @returns The type of the handler (EXPORTED_HANDLER or WORKER_ENTRYPOINT)
   * @throws TypeError if the handler is invalid
   */
  validateHandler(handler, name) {
    if (typeof handler === "object" && handler !== null && typeof handler.fetch === "function") {
      return { type: 0 /* EXPORTED_HANDLER */, handler };
    }
    if (typeof handler === "function" && handler.prototype instanceof WorkerEntrypoint) {
      return { type: 1 /* WORKER_ENTRYPOINT */, handler };
    }
    throw new TypeError(`${name} must be either an ExportedHandler object with a fetch method or a class extending WorkerEntrypoint`);
  }
  /**
   * Main fetch handler for the Worker
   * Routes requests to the appropriate handler based on the URL
   * @param request - The HTTP request
   * @param env - Cloudflare Worker environment variables
   * @param ctx - Cloudflare Worker execution context
   * @returns A Promise resolving to an HTTP Response
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (this.isApiRequest(url) || url.pathname === "/.well-known/oauth-authorization-server" || this.isTokenEndpoint(url) || this.options.clientRegistrationEndpoint && this.isClientRegistrationEndpoint(url)) {
        return this.addCorsHeaders(
          new Response(null, {
            status: 204,
            headers: { "Content-Length": "0" }
          }),
          request
        );
      }
    }
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      const response = await this.handleMetadataDiscovery(url);
      return this.addCorsHeaders(response, request);
    }
    if (this.isTokenEndpoint(url)) {
      const response = await this.handleTokenRequest(request, env);
      return this.addCorsHeaders(response, request);
    }
    if (this.options.clientRegistrationEndpoint && this.isClientRegistrationEndpoint(url)) {
      const response = await this.handleClientRegistration(request, env);
      return this.addCorsHeaders(response, request);
    }
    if (this.isApiRequest(url)) {
      const response = await this.handleApiRequest(request, env, ctx);
      return this.addCorsHeaders(response, request);
    }
    if (!env.OAUTH_PROVIDER) {
      env.OAUTH_PROVIDER = this.createOAuthHelpers(env);
    }
    if (this.typedDefaultHandler.type === 0 /* EXPORTED_HANDLER */) {
      return this.typedDefaultHandler.handler.fetch(request, env, ctx);
    } else {
      const handler = new this.typedDefaultHandler.handler(ctx, env);
      return handler.fetch(request);
    }
  }
  /**
   * Determines if an endpoint configuration is a path or a full URL
   * @param endpoint - The endpoint configuration
   * @returns True if the endpoint is a path (starts with /), false if it's a full URL
   */
  isPath(endpoint) {
    return endpoint.startsWith("/");
  }
  /**
   * Matches a URL against an endpoint pattern that can be a full URL or just a path
   * @param url - The URL to check
   * @param endpoint - The endpoint pattern (full URL or path)
   * @returns True if the URL matches the endpoint pattern
   */
  matchEndpoint(url, endpoint) {
    if (this.isPath(endpoint)) {
      return url.pathname === endpoint;
    } else {
      const endpointUrl = new URL(endpoint);
      return url.hostname === endpointUrl.hostname && url.pathname === endpointUrl.pathname;
    }
  }
  /**
   * Checks if a URL matches the configured token endpoint
   * @param url - The URL to check
   * @returns True if the URL matches the token endpoint
   */
  isTokenEndpoint(url) {
    return this.matchEndpoint(url, this.options.tokenEndpoint);
  }
  /**
   * Checks if a URL matches the configured client registration endpoint
   * @param url - The URL to check
   * @returns True if the URL matches the client registration endpoint
   */
  isClientRegistrationEndpoint(url) {
    if (!this.options.clientRegistrationEndpoint) return false;
    return this.matchEndpoint(url, this.options.clientRegistrationEndpoint);
  }
  /**
   * Checks if a URL matches a specific API route
   * @param url - The URL to check
   * @param route - The API route to check against
   * @returns True if the URL matches the API route
   */
  matchApiRoute(url, route) {
    if (this.isPath(route)) {
      return url.pathname.startsWith(route);
    } else {
      const apiUrl = new URL(route);
      return url.hostname === apiUrl.hostname && url.pathname.startsWith(apiUrl.pathname);
    }
  }
  /**
   * Checks if a URL is an API request based on the configured API route(s)
   * @param url - The URL to check
   * @returns True if the URL matches any of the API routes
   */
  isApiRequest(url) {
    if (Array.isArray(this.options.apiRoute)) {
      return this.options.apiRoute.some((route) => this.matchApiRoute(url, route));
    } else {
      return this.matchApiRoute(url, this.options.apiRoute);
    }
  }
  /**
   * Gets the full URL for an endpoint, using the provided request URL's
   * origin for endpoints specified as just paths
   * @param endpoint - The endpoint configuration (path or full URL)
   * @param requestUrl - The URL of the incoming request
   * @returns The full URL for the endpoint
   */
  getFullEndpointUrl(endpoint, requestUrl) {
    if (this.isPath(endpoint)) {
      return `${requestUrl.origin}${endpoint}`;
    } else {
      return endpoint;
    }
  }
  /**
   * Adds CORS headers to a response
   * @param response - The response to add CORS headers to
   * @param request - The original request
   * @returns A new Response with CORS headers added
   */
  addCorsHeaders(response, request) {
    const origin = request.headers.get("Origin");
    if (!origin) {
      return response;
    }
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", origin);
    newResponse.headers.set("Access-Control-Allow-Methods", "*");
    newResponse.headers.set("Access-Control-Allow-Headers", "Authorization, *");
    newResponse.headers.set("Access-Control-Max-Age", "86400");
    return newResponse;
  }
  /**
   * Handles the OAuth metadata discovery endpoint
   * Implements RFC 8414 for OAuth Server Metadata
   * @param requestUrl - The URL of the incoming request
   * @returns Response with OAuth server metadata
   */
  async handleMetadataDiscovery(requestUrl) {
    const tokenEndpoint = this.getFullEndpointUrl(this.options.tokenEndpoint, requestUrl);
    const authorizeEndpoint = this.getFullEndpointUrl(this.options.authorizeEndpoint, requestUrl);
    let registrationEndpoint = void 0;
    if (this.options.clientRegistrationEndpoint) {
      registrationEndpoint = this.getFullEndpointUrl(this.options.clientRegistrationEndpoint, requestUrl);
    }
    const responseTypesSupported = ["code"];
    if (this.options.allowImplicitFlow) {
      responseTypesSupported.push("token");
    }
    const metadata = {
      issuer: new URL(tokenEndpoint).origin,
      authorization_endpoint: authorizeEndpoint,
      token_endpoint: tokenEndpoint,
      // not implemented: jwks_uri
      registration_endpoint: registrationEndpoint,
      scopes_supported: this.options.scopesSupported,
      response_types_supported: responseTypesSupported,
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // Support "none" auth method for public clients
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      // not implemented: token_endpoint_auth_signing_alg_values_supported
      // not implemented: service_documentation
      // not implemented: ui_locales_supported
      // not implemented: op_policy_uri
      // not implemented: op_tos_uri
      revocation_endpoint: tokenEndpoint,
      // Reusing token endpoint for revocation
      // not implemented: revocation_endpoint_auth_methods_supported
      // not implemented: revocation_endpoint_auth_signing_alg_values_supported
      // not implemented: introspection_endpoint
      // not implemented: introspection_endpoint_auth_methods_supported
      // not implemented: introspection_endpoint_auth_signing_alg_values_supported
      code_challenge_methods_supported: ["plain", "S256"]
      // PKCE support
    };
    return new Response(JSON.stringify(metadata), {
      headers: { "Content-Type": "application/json" }
    });
  }
  /**
   * Handles client authentication and token issuance via the token endpoint
   * Supports authorization_code and refresh_token grant types
   * @param request - The HTTP request
   * @param env - Cloudflare Worker environment variables
   * @returns Response with token data or error
   */
  async handleTokenRequest(request, env) {
    if (request.method !== "POST") {
      return createErrorResponse(
        "invalid_request",
        "Method not allowed",
        405
      );
    }
    let contentType = request.headers.get("Content-Type") || "";
    let body = {};
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      return createErrorResponse(
        "invalid_request",
        "Content-Type must be application/x-www-form-urlencoded",
        400
      );
    }
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      body[key] = value;
    }
    const authHeader = request.headers.get("Authorization");
    let clientId = "";
    let clientSecret = "";
    if (authHeader && authHeader.startsWith("Basic ")) {
      const credentials = atob(authHeader.substring(6));
      const [id, secret] = credentials.split(":");
      clientId = id;
      clientSecret = secret || "";
    } else {
      clientId = body.client_id;
      clientSecret = body.client_secret || "";
    }
    if (!clientId) {
      return createErrorResponse(
        "invalid_client",
        "Client ID is required",
        401
      );
    }
    const clientInfo = await this.getClient(env, clientId);
    if (!clientInfo) {
      return createErrorResponse(
        "invalid_client",
        "Client not found",
        401
      );
    }
    const isPublicClient = clientInfo.tokenEndpointAuthMethod === "none";
    if (!isPublicClient) {
      if (!clientSecret) {
        return createErrorResponse(
          "invalid_client",
          "Client authentication failed: missing client_secret",
          401
        );
      }
      if (!clientInfo.clientSecret) {
        return createErrorResponse(
          "invalid_client",
          "Client authentication failed: client has no registered secret",
          401
        );
      }
      const providedSecretHash = await hashSecret(clientSecret);
      if (providedSecretHash !== clientInfo.clientSecret) {
        return createErrorResponse(
          "invalid_client",
          "Client authentication failed: invalid client_secret",
          401
        );
      }
    }
    const grantType = body.grant_type;
    if (grantType === "authorization_code") {
      return this.handleAuthorizationCodeGrant(body, clientInfo, env);
    } else if (grantType === "refresh_token") {
      return this.handleRefreshTokenGrant(body, clientInfo, env);
    } else {
      return createErrorResponse(
        "unsupported_grant_type",
        "Grant type not supported"
      );
    }
  }
  /**
   * Handles the authorization code grant type
   * Exchanges an authorization code for access and refresh tokens
   * @param body - The parsed request body
   * @param clientInfo - The authenticated client information
   * @param env - Cloudflare Worker environment variables
   * @returns Response with token data or error
   */
  async handleAuthorizationCodeGrant(body, clientInfo, env) {
    const code = body.code;
    const redirectUri = body.redirect_uri;
    const codeVerifier = body.code_verifier;
    if (!code) {
      return createErrorResponse(
        "invalid_request",
        "Authorization code is required"
      );
    }
    const codeParts = code.split(":");
    if (codeParts.length !== 3) {
      return createErrorResponse(
        "invalid_grant",
        "Invalid authorization code format"
      );
    }
    const [userId, grantId, _] = codeParts;
    const grantKey = `grant:${userId}:${grantId}`;
    const grantData = await env.OAUTH_KV.get(grantKey, { type: "json" });
    if (!grantData) {
      return createErrorResponse(
        "invalid_grant",
        "Grant not found or authorization code expired"
      );
    }
    if (!grantData.authCodeId) {
      return createErrorResponse(
        "invalid_grant",
        "Authorization code already used"
      );
    }
    const codeHash = await hashSecret(code);
    if (codeHash !== grantData.authCodeId) {
      return createErrorResponse(
        "invalid_grant",
        "Invalid authorization code"
      );
    }
    if (grantData.clientId !== clientInfo.clientId) {
      return createErrorResponse(
        "invalid_grant",
        "Client ID mismatch"
      );
    }
    const isPkceEnabled = !!grantData.codeChallenge;
    if (!redirectUri && !isPkceEnabled) {
      return createErrorResponse(
        "invalid_request",
        "redirect_uri is required when not using PKCE"
      );
    }
    if (redirectUri && !clientInfo.redirectUris.includes(redirectUri)) {
      return createErrorResponse(
        "invalid_grant",
        "Invalid redirect URI"
      );
    }
    if (isPkceEnabled) {
      if (!codeVerifier) {
        return createErrorResponse(
          "invalid_request",
          "code_verifier is required for PKCE"
        );
      }
      let calculatedChallenge;
      if (grantData.codeChallengeMethod === "S256") {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        calculatedChallenge = base64UrlEncode(String.fromCharCode(...hashArray));
      } else {
        calculatedChallenge = codeVerifier;
      }
      if (calculatedChallenge !== grantData.codeChallenge) {
        return createErrorResponse(
          "invalid_grant",
          "Invalid PKCE code_verifier"
        );
      }
    }
    const accessTokenSecret = generateRandomString(TOKEN_LENGTH);
    const refreshTokenSecret = generateRandomString(TOKEN_LENGTH);
    const accessToken = `${userId}:${grantId}:${accessTokenSecret}`;
    const refreshToken = `${userId}:${grantId}:${refreshTokenSecret}`;
    const accessTokenId = await generateTokenId(accessToken);
    const refreshTokenId = await generateTokenId(refreshToken);
    const now = Math.floor(Date.now() / 1e3);
    const accessTokenExpiresAt = now + this.options.accessTokenTTL;
    const encryptionKey = await unwrapKeyWithToken(code, grantData.authCodeWrappedKey);
    const accessTokenWrappedKey = await wrapKeyWithToken(accessToken, encryptionKey);
    const refreshTokenWrappedKey = await wrapKeyWithToken(refreshToken, encryptionKey);
    delete grantData.authCodeId;
    delete grantData.codeChallenge;
    delete grantData.codeChallengeMethod;
    delete grantData.authCodeWrappedKey;
    grantData.refreshTokenId = refreshTokenId;
    grantData.refreshTokenWrappedKey = refreshTokenWrappedKey;
    grantData.previousRefreshTokenId = void 0;
    grantData.previousRefreshTokenWrappedKey = void 0;
    await env.OAUTH_KV.put(grantKey, JSON.stringify(grantData));
    const accessTokenData = {
      id: accessTokenId,
      grantId,
      userId,
      createdAt: now,
      expiresAt: accessTokenExpiresAt,
      wrappedEncryptionKey: accessTokenWrappedKey,
      grant: {
        clientId: grantData.clientId,
        scope: grantData.scope,
        encryptedProps: grantData.encryptedProps
      }
    };
    await env.OAUTH_KV.put(
      `token:${userId}:${grantId}:${accessTokenId}`,
      JSON.stringify(accessTokenData),
      { expirationTtl: this.options.accessTokenTTL }
    );
    return new Response(JSON.stringify({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: this.options.accessTokenTTL,
      refresh_token: refreshToken,
      scope: grantData.scope.join(" ")
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  /**
   * Handles the refresh token grant type
   * Issues a new access token using a refresh token
   * @param body - The parsed request body
   * @param clientInfo - The authenticated client information
   * @param env - Cloudflare Worker environment variables
   * @returns Response with token data or error
   */
  async handleRefreshTokenGrant(body, clientInfo, env) {
    const refreshToken = body.refresh_token;
    if (!refreshToken) {
      return createErrorResponse(
        "invalid_request",
        "Refresh token is required"
      );
    }
    const tokenParts = refreshToken.split(":");
    if (tokenParts.length !== 3) {
      return createErrorResponse(
        "invalid_grant",
        "Invalid token format"
      );
    }
    const [userId, grantId, _] = tokenParts;
    const providedTokenHash = await generateTokenId(refreshToken);
    const grantKey = `grant:${userId}:${grantId}`;
    const grantData = await env.OAUTH_KV.get(grantKey, { type: "json" });
    if (!grantData) {
      return createErrorResponse(
        "invalid_grant",
        "Grant not found"
      );
    }
    const isCurrentToken = grantData.refreshTokenId === providedTokenHash;
    const isPreviousToken = grantData.previousRefreshTokenId === providedTokenHash;
    if (!isCurrentToken && !isPreviousToken) {
      return createErrorResponse(
        "invalid_grant",
        "Invalid refresh token"
      );
    }
    if (grantData.clientId !== clientInfo.clientId) {
      return createErrorResponse(
        "invalid_grant",
        "Client ID mismatch"
      );
    }
    const accessTokenSecret = generateRandomString(TOKEN_LENGTH);
    const newAccessToken = `${userId}:${grantId}:${accessTokenSecret}`;
    const accessTokenId = await generateTokenId(newAccessToken);
    const refreshTokenSecret = generateRandomString(TOKEN_LENGTH);
    const newRefreshToken = `${userId}:${grantId}:${refreshTokenSecret}`;
    const newRefreshTokenId = await generateTokenId(newRefreshToken);
    const now = Math.floor(Date.now() / 1e3);
    const accessTokenExpiresAt = now + this.options.accessTokenTTL;
    let wrappedKeyToUse;
    if (isCurrentToken) {
      wrappedKeyToUse = grantData.refreshTokenWrappedKey;
    } else {
      wrappedKeyToUse = grantData.previousRefreshTokenWrappedKey;
    }
    const encryptionKey = await unwrapKeyWithToken(refreshToken, wrappedKeyToUse);
    const accessTokenWrappedKey = await wrapKeyWithToken(newAccessToken, encryptionKey);
    const newRefreshTokenWrappedKey = await wrapKeyWithToken(newRefreshToken, encryptionKey);
    grantData.previousRefreshTokenId = providedTokenHash;
    grantData.previousRefreshTokenWrappedKey = wrappedKeyToUse;
    grantData.refreshTokenId = newRefreshTokenId;
    grantData.refreshTokenWrappedKey = newRefreshTokenWrappedKey;
    await env.OAUTH_KV.put(grantKey, JSON.stringify(grantData));
    const accessTokenData = {
      id: accessTokenId,
      grantId,
      userId,
      createdAt: now,
      expiresAt: accessTokenExpiresAt,
      wrappedEncryptionKey: accessTokenWrappedKey,
      grant: {
        clientId: grantData.clientId,
        scope: grantData.scope,
        encryptedProps: grantData.encryptedProps
      }
    };
    await env.OAUTH_KV.put(
      `token:${userId}:${grantId}:${accessTokenId}`,
      JSON.stringify(accessTokenData),
      { expirationTtl: this.options.accessTokenTTL }
    );
    return new Response(JSON.stringify({
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: this.options.accessTokenTTL,
      refresh_token: newRefreshToken,
      scope: grantData.scope.join(" ")
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  /**
   * Handles the dynamic client registration endpoint (RFC 7591)
   * @param request - The HTTP request
   * @param env - Cloudflare Worker environment variables
   * @returns Response with client registration data or error
   */
  async handleClientRegistration(request, env) {
    if (!this.options.clientRegistrationEndpoint) {
      return createErrorResponse(
        "not_implemented",
        "Client registration is not enabled",
        501
      );
    }
    if (request.method !== "POST") {
      return createErrorResponse(
        "invalid_request",
        "Method not allowed",
        405
      );
    }
    const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (contentLength > 1048576) {
      return createErrorResponse(
        "invalid_request",
        "Request payload too large, must be under 1 MiB",
        413
      );
    }
    let clientMetadata;
    try {
      const text = await request.text();
      if (text.length > 1048576) {
        return createErrorResponse(
          "invalid_request",
          "Request payload too large, must be under 1 MiB",
          413
        );
      }
      clientMetadata = JSON.parse(text);
    } catch (error) {
      return createErrorResponse(
        "invalid_request",
        "Invalid JSON payload",
        400
      );
    }
    const validateStringField = (field) => {
      if (field === void 0) {
        return void 0;
      }
      if (typeof field !== "string") {
        throw new Error("Field must be a string");
      }
      return field;
    };
    const validateStringArray = (arr) => {
      if (arr === void 0) {
        return void 0;
      }
      if (!Array.isArray(arr)) {
        throw new Error("Field must be an array");
      }
      for (const item of arr) {
        if (typeof item !== "string") {
          throw new Error("All array elements must be strings");
        }
      }
      return arr;
    };
    const authMethod = validateStringField(clientMetadata.token_endpoint_auth_method) || "client_secret_basic";
    const isPublicClient = authMethod === "none";
    if (isPublicClient && this.options.disallowPublicClientRegistration) {
      return createErrorResponse(
        "invalid_client_metadata",
        "Public client registration is not allowed"
      );
    }
    const clientId = generateRandomString(16);
    let clientSecret;
    let hashedSecret;
    if (!isPublicClient) {
      clientSecret = generateRandomString(32);
      hashedSecret = await hashSecret(clientSecret);
    }
    let clientInfo;
    try {
      const redirectUris = validateStringArray(clientMetadata.redirect_uris);
      if (!redirectUris || redirectUris.length === 0) {
        throw new Error("At least one redirect URI is required");
      }
      clientInfo = {
        clientId,
        redirectUris,
        clientName: validateStringField(clientMetadata.client_name),
        logoUri: validateStringField(clientMetadata.logo_uri),
        clientUri: validateStringField(clientMetadata.client_uri),
        policyUri: validateStringField(clientMetadata.policy_uri),
        tosUri: validateStringField(clientMetadata.tos_uri),
        jwksUri: validateStringField(clientMetadata.jwks_uri),
        contacts: validateStringArray(clientMetadata.contacts),
        grantTypes: validateStringArray(clientMetadata.grant_types) || ["authorization_code", "refresh_token"],
        responseTypes: validateStringArray(clientMetadata.response_types) || ["code"],
        registrationDate: Math.floor(Date.now() / 1e3),
        tokenEndpointAuthMethod: authMethod
      };
      if (!isPublicClient && hashedSecret) {
        clientInfo.clientSecret = hashedSecret;
      }
    } catch (error) {
      return createErrorResponse(
        "invalid_client_metadata",
        error instanceof Error ? error.message : "Invalid client metadata"
      );
    }
    await env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(clientInfo));
    const response = {
      client_id: clientInfo.clientId,
      redirect_uris: clientInfo.redirectUris,
      client_name: clientInfo.clientName,
      logo_uri: clientInfo.logoUri,
      client_uri: clientInfo.clientUri,
      policy_uri: clientInfo.policyUri,
      tos_uri: clientInfo.tosUri,
      jwks_uri: clientInfo.jwksUri,
      contacts: clientInfo.contacts,
      grant_types: clientInfo.grantTypes,
      response_types: clientInfo.responseTypes,
      token_endpoint_auth_method: clientInfo.tokenEndpointAuthMethod,
      registration_client_uri: `${this.options.clientRegistrationEndpoint}/${clientId}`,
      client_id_issued_at: clientInfo.registrationDate
    };
    if (clientSecret) {
      response.client_secret = clientSecret;
    }
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }
  /**
   * Handles API requests by validating the access token and calling the API handler
   * @param request - The HTTP request
   * @param env - Cloudflare Worker environment variables
   * @param ctx - Cloudflare Worker execution context
   * @returns Response from the API handler or error
   */
  async handleApiRequest(request, env, ctx) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createErrorResponse(
        "invalid_token",
        "Missing or invalid access token",
        401,
        { "WWW-Authenticate": 'Bearer realm="OAuth", error="invalid_token", error_description="Missing or invalid access token"' }
      );
    }
    const accessToken = authHeader.substring(7);
    const tokenParts = accessToken.split(":");
    if (tokenParts.length !== 3) {
      return createErrorResponse(
        "invalid_token",
        "Invalid token format",
        401,
        { "WWW-Authenticate": 'Bearer realm="OAuth", error="invalid_token"' }
      );
    }
    const [userId, grantId, _] = tokenParts;
    const accessTokenId = await generateTokenId(accessToken);
    const tokenKey = `token:${userId}:${grantId}:${accessTokenId}`;
    const tokenData = await env.OAUTH_KV.get(tokenKey, { type: "json" });
    if (!tokenData) {
      return createErrorResponse(
        "invalid_token",
        "Invalid access token",
        401,
        { "WWW-Authenticate": 'Bearer realm="OAuth", error="invalid_token"' }
      );
    }
    const now = Math.floor(Date.now() / 1e3);
    if (tokenData.expiresAt < now) {
      return createErrorResponse(
        "invalid_token",
        "Access token expired",
        401,
        { "WWW-Authenticate": 'Bearer realm="OAuth", error="invalid_token"' }
      );
    }
    const encryptionKey = await unwrapKeyWithToken(accessToken, tokenData.wrappedEncryptionKey);
    const decryptedProps = await decryptProps(
      encryptionKey,
      tokenData.grant.encryptedProps
    );
    ctx.props = decryptedProps;
    if (!env.OAUTH_PROVIDER) {
      env.OAUTH_PROVIDER = this.createOAuthHelpers(env);
    }
    if (this.typedApiHandler.type === 0 /* EXPORTED_HANDLER */) {
      return this.typedApiHandler.handler.fetch(request, env, ctx);
    } else {
      const handler = new this.typedApiHandler.handler(ctx, env);
      return handler.fetch(request);
    }
  }
  /**
   * Creates the helper methods object for OAuth operations
   * This is passed to the handler functions to allow them to interact with the OAuth system
   * @param env - Cloudflare Worker environment variables
   * @returns An instance of OAuthHelpers
   */
  createOAuthHelpers(env) {
    return new OAuthHelpersImpl(env, this);
  }
  /**
   * Fetches client information from KV storage
   * This method is not private because `OAuthHelpers` needs to call it. Note that since
   * `OAuthProviderImpl` is not exposed outside this module, this is still effectively
   * module-private.
   * @param env - Cloudflare Worker environment variables
   * @param clientId - The client ID to look up
   * @returns The client information, or null if not found
   */
  getClient(env, clientId) {
    const clientKey = `client:${clientId}`;
    return env.OAUTH_KV.get(clientKey, { type: "json" });
  }
};
var DEFAULT_ACCESS_TOKEN_TTL = 60 * 60;
var TOKEN_LENGTH = 32;
function createErrorResponse(code, description, status = 400, headers = {}) {
  const body = JSON.stringify({
    error: code,
    error_description: description
  });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
async function hashSecret(secret) {
  return generateTokenId(secret);
}
function generateRandomString(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += characters.charAt(values[i] % characters.length);
  }
  return result;
}
async function generateTokenId(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
async function encryptProps(data) {
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    // extractable
    ["encrypt", "decrypt"]
  );
  const iv = new Uint8Array(12);
  const jsonData = JSON.stringify(data);
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(jsonData);
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encodedData
  );
  return {
    encryptedData: arrayBufferToBase64(encryptedBuffer),
    key
  };
}
async function decryptProps(key, encryptedData) {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const iv = new Uint8Array(12);
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encryptedBuffer
  );
  const decoder = new TextDecoder();
  const jsonData = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonData);
}
var WRAPPING_KEY_HMAC_KEY = new Uint8Array([
  34,
  126,
  38,
  134,
  141,
  241,
  225,
  109,
  128,
  112,
  234,
  23,
  151,
  91,
  71,
  166,
  130,
  24,
  250,
  135,
  40,
  174,
  222,
  133,
  181,
  29,
  74,
  217,
  150,
  202,
  202,
  67
]);
async function deriveKeyFromToken(tokenStr) {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    WRAPPING_KEY_HMAC_KEY,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const hmacResult = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    encoder.encode(tokenStr)
  );
  return await crypto.subtle.importKey(
    "raw",
    hmacResult,
    { name: "AES-KW" },
    false,
    // not extractable
    ["wrapKey", "unwrapKey"]
  );
}
async function wrapKeyWithToken(tokenStr, keyToWrap) {
  const wrappingKey = await deriveKeyFromToken(tokenStr);
  const wrappedKeyBuffer = await crypto.subtle.wrapKey(
    "raw",
    keyToWrap,
    wrappingKey,
    { name: "AES-KW" }
  );
  return arrayBufferToBase64(wrappedKeyBuffer);
}
async function unwrapKeyWithToken(tokenStr, wrappedKeyBase64) {
  const wrappingKey = await deriveKeyFromToken(tokenStr);
  const wrappedKeyBuffer = base64ToArrayBuffer(wrappedKeyBase64);
  return await crypto.subtle.unwrapKey(
    "raw",
    wrappedKeyBuffer,
    wrappingKey,
    { name: "AES-KW" },
    { name: "AES-GCM" },
    true,
    // extractable
    ["encrypt", "decrypt"]
  );
}
var OAuthHelpersImpl = class {
  /**
   * Creates a new OAuthHelpers instance
   * @param env - Cloudflare Worker environment variables
   * @param provider - Reference to the parent provider instance
   */
  constructor(env, provider) {
    this.env = env;
    this.provider = provider;
  }
  /**
   * Parses an OAuth authorization request from the HTTP request
   * @param request - The HTTP request containing OAuth parameters
   * @returns The parsed authorization request parameters
   */
  async parseAuthRequest(request) {
    const url = new URL(request.url);
    const responseType = url.searchParams.get("response_type") || "";
    const clientId = url.searchParams.get("client_id") || "";
    const redirectUri = url.searchParams.get("redirect_uri") || "";
    const scope = (url.searchParams.get("scope") || "").split(" ").filter(Boolean);
    const state = url.searchParams.get("state") || "";
    const codeChallenge = url.searchParams.get("code_challenge") || void 0;
    const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "plain";
    if (responseType === "token" && !this.provider.options.allowImplicitFlow) {
      throw new Error("The implicit grant flow is not enabled for this provider");
    }
    return {
      responseType,
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod
    };
  }
  /**
   * Looks up a client by its client ID
   * @param clientId - The client ID to look up
   * @returns A Promise resolving to the client info, or null if not found
   */
  async lookupClient(clientId) {
    return await this.provider.getClient(this.env, clientId);
  }
  /**
   * Completes an authorization request by creating a grant and either:
   * - For authorization code flow: generating an authorization code
   * - For implicit flow: generating an access token directly
   * @param options - Options specifying the grant details
   * @returns A Promise resolving to an object containing the redirect URL
   */
  async completeAuthorization(options) {
    const grantId = generateRandomString(16);
    const { encryptedData, key: encryptionKey } = await encryptProps(options.props);
    const now = Math.floor(Date.now() / 1e3);
    if (options.request.responseType === "token") {
      const accessTokenSecret = generateRandomString(TOKEN_LENGTH);
      const accessToken = `${options.userId}:${grantId}:${accessTokenSecret}`;
      const accessTokenId = await generateTokenId(accessToken);
      const accessTokenTTL = this.provider.options.accessTokenTTL || DEFAULT_ACCESS_TOKEN_TTL;
      const accessTokenExpiresAt = now + accessTokenTTL;
      const accessTokenWrappedKey = await wrapKeyWithToken(accessToken, encryptionKey);
      const grant = {
        id: grantId,
        clientId: options.request.clientId,
        userId: options.userId,
        scope: options.scope,
        metadata: options.metadata,
        encryptedProps: encryptedData,
        createdAt: now
      };
      const grantKey = `grant:${options.userId}:${grantId}`;
      await this.env.OAUTH_KV.put(grantKey, JSON.stringify(grant));
      const accessTokenData = {
        id: accessTokenId,
        grantId,
        userId: options.userId,
        createdAt: now,
        expiresAt: accessTokenExpiresAt,
        wrappedEncryptionKey: accessTokenWrappedKey,
        grant: {
          clientId: options.request.clientId,
          scope: options.scope,
          encryptedProps: encryptedData
        }
      };
      await this.env.OAUTH_KV.put(
        `token:${options.userId}:${grantId}:${accessTokenId}`,
        JSON.stringify(accessTokenData),
        { expirationTtl: accessTokenTTL }
      );
      const redirectUrl = new URL(options.request.redirectUri);
      const fragment = new URLSearchParams();
      fragment.set("access_token", accessToken);
      fragment.set("token_type", "bearer");
      fragment.set("expires_in", accessTokenTTL.toString());
      fragment.set("scope", options.scope.join(" "));
      if (options.request.state) {
        fragment.set("state", options.request.state);
      }
      redirectUrl.hash = fragment.toString();
      return { redirectTo: redirectUrl.toString() };
    } else {
      const authCodeSecret = generateRandomString(32);
      const authCode = `${options.userId}:${grantId}:${authCodeSecret}`;
      const authCodeId = await hashSecret(authCode);
      const authCodeWrappedKey = await wrapKeyWithToken(authCode, encryptionKey);
      const grant = {
        id: grantId,
        clientId: options.request.clientId,
        userId: options.userId,
        scope: options.scope,
        metadata: options.metadata,
        encryptedProps: encryptedData,
        createdAt: now,
        authCodeId,
        // Store the auth code hash in the grant
        authCodeWrappedKey,
        // Store the wrapped key
        // Store PKCE parameters if provided
        codeChallenge: options.request.codeChallenge,
        codeChallengeMethod: options.request.codeChallengeMethod
      };
      const grantKey = `grant:${options.userId}:${grantId}`;
      const codeExpiresIn = 600;
      await this.env.OAUTH_KV.put(grantKey, JSON.stringify(grant), { expirationTtl: codeExpiresIn });
      const redirectUrl = new URL(options.request.redirectUri);
      redirectUrl.searchParams.set("code", authCode);
      if (options.request.state) {
        redirectUrl.searchParams.set("state", options.request.state);
      }
      return { redirectTo: redirectUrl.toString() };
    }
  }
  /**
   * Creates a new OAuth client
   * @param clientInfo - Partial client information to create the client with
   * @returns A Promise resolving to the created client info
   */
  async createClient(clientInfo) {
    const clientId = generateRandomString(16);
    const tokenEndpointAuthMethod = clientInfo.tokenEndpointAuthMethod || "client_secret_basic";
    const isPublicClient = tokenEndpointAuthMethod === "none";
    const newClient = {
      clientId,
      redirectUris: clientInfo.redirectUris || [],
      clientName: clientInfo.clientName,
      logoUri: clientInfo.logoUri,
      clientUri: clientInfo.clientUri,
      policyUri: clientInfo.policyUri,
      tosUri: clientInfo.tosUri,
      jwksUri: clientInfo.jwksUri,
      contacts: clientInfo.contacts,
      grantTypes: clientInfo.grantTypes || ["authorization_code", "refresh_token"],
      responseTypes: clientInfo.responseTypes || ["code"],
      registrationDate: Math.floor(Date.now() / 1e3),
      tokenEndpointAuthMethod
    };
    let clientSecret;
    if (!isPublicClient) {
      clientSecret = generateRandomString(32);
      newClient.clientSecret = await hashSecret(clientSecret);
    }
    await this.env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(newClient));
    const clientResponse = { ...newClient };
    if (!isPublicClient && clientSecret) {
      clientResponse.clientSecret = clientSecret;
    }
    return clientResponse;
  }
  /**
   * Lists all registered OAuth clients with pagination support
   * @param options - Optional pagination parameters (limit and cursor)
   * @returns A Promise resolving to the list result with items and optional cursor
   */
  async listClients(options) {
    const listOptions = {
      prefix: "client:"
    };
    if (options?.limit !== void 0) {
      listOptions.limit = options.limit;
    }
    if (options?.cursor !== void 0) {
      listOptions.cursor = options.cursor;
    }
    const response = await this.env.OAUTH_KV.list(listOptions);
    const clients = [];
    const promises = response.keys.map(async (key) => {
      const clientId = key.name.substring("client:".length);
      const client = await this.provider.getClient(this.env, clientId);
      if (client) {
        clients.push(client);
      }
    });
    await Promise.all(promises);
    return {
      items: clients,
      cursor: response.list_complete ? void 0 : response.cursor
    };
  }
  /**
   * Updates an existing OAuth client
   * @param clientId - The ID of the client to update
   * @param updates - Partial client information with fields to update
   * @returns A Promise resolving to the updated client info, or null if not found
   */
  async updateClient(clientId, updates) {
    const client = await this.provider.getClient(this.env, clientId);
    if (!client) {
      return null;
    }
    let authMethod = updates.tokenEndpointAuthMethod || client.tokenEndpointAuthMethod || "client_secret_basic";
    const isPublicClient = authMethod === "none";
    let secretToStore = client.clientSecret;
    let originalSecret = void 0;
    if (isPublicClient) {
      secretToStore = void 0;
    } else if (updates.clientSecret) {
      originalSecret = updates.clientSecret;
      secretToStore = await hashSecret(updates.clientSecret);
    }
    const updatedClient = {
      ...client,
      ...updates,
      clientId: client.clientId,
      // Ensure clientId doesn't change
      tokenEndpointAuthMethod: authMethod
      // Use determined auth method
    };
    if (!isPublicClient && secretToStore) {
      updatedClient.clientSecret = secretToStore;
    } else {
      delete updatedClient.clientSecret;
    }
    await this.env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(updatedClient));
    const response = { ...updatedClient };
    if (!isPublicClient && originalSecret) {
      response.clientSecret = originalSecret;
    }
    return response;
  }
  /**
   * Deletes an OAuth client
   * @param clientId - The ID of the client to delete
   * @returns A Promise resolving when the deletion is confirmed.
   */
  async deleteClient(clientId) {
    await this.env.OAUTH_KV.delete(`client:${clientId}`);
  }
  /**
   * Lists all authorization grants for a specific user with pagination support
   * Returns a summary of each grant without sensitive information
   * @param userId - The ID of the user whose grants to list
   * @param options - Optional pagination parameters (limit and cursor)
   * @returns A Promise resolving to the list result with grant summaries and optional cursor
   */
  async listUserGrants(userId, options) {
    const listOptions = {
      prefix: `grant:${userId}:`
    };
    if (options?.limit !== void 0) {
      listOptions.limit = options.limit;
    }
    if (options?.cursor !== void 0) {
      listOptions.cursor = options.cursor;
    }
    const response = await this.env.OAUTH_KV.list(listOptions);
    const grantSummaries = [];
    const promises = response.keys.map(async (key) => {
      const grantData = await this.env.OAUTH_KV.get(key.name, { type: "json" });
      if (grantData) {
        const summary = {
          id: grantData.id,
          clientId: grantData.clientId,
          userId: grantData.userId,
          scope: grantData.scope,
          metadata: grantData.metadata,
          createdAt: grantData.createdAt
        };
        grantSummaries.push(summary);
      }
    });
    await Promise.all(promises);
    return {
      items: grantSummaries,
      cursor: response.list_complete ? void 0 : response.cursor
    };
  }
  /**
   * Revokes an authorization grant and all its associated access tokens
   * @param grantId - The ID of the grant to revoke
   * @param userId - The ID of the user who owns the grant
   * @returns A Promise resolving when the revocation is confirmed.
   */
  async revokeGrant(grantId, userId) {
    const grantKey = `grant:${userId}:${grantId}`;
    const tokenPrefix = `token:${userId}:${grantId}:`;
    let cursor;
    let allTokensDeleted = false;
    while (!allTokensDeleted) {
      const listOptions = {
        prefix: tokenPrefix
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }
      const result = await this.env.OAUTH_KV.list(listOptions);
      if (result.keys.length > 0) {
        await Promise.all(result.keys.map((key) => {
          return this.env.OAUTH_KV.delete(key.name);
        }));
      }
      if (result.list_complete) {
        allTokensDeleted = true;
      } else {
        cursor = result.cursor;
      }
    }
    await this.env.OAUTH_KV.delete(grantKey);
  }
};
var oauth_provider_default = OAuthProvider;
export {
  OAuthProvider,
  oauth_provider_default as default
};
