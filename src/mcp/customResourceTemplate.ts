/**
 * Custom URI template implementation that fixes the MCP SDK's broken
 * URI template matching for grouped query parameters.
 *
 * This is duck typing implementation of the ResourceTemplate class.
 * See @modelcontextprotocol/sdk/server/mcp.js
 *
 * This is only a temporary solution, as we should use the official implementation from the SDK
 * Upon the SDK being fixed, we should switch over to that implementation.
 */

// TODO: Get rid of 'any' typing for better type safety

/**
 * Custom URI template class that properly handles grouped query parameters
 * in the format {?param1,param2,param3}
 */
export class CustomUriTemplate {
  private template: string;
  private baseUri: string = "";
  private queryParams: string[] = [];

  constructor(template: string) {
    this.template = template;
    this.parseTemplate();
  }

  toString(): string {
    return this.template;
  }

  private parseTemplate(): void {
    // Extract base URI and query parameters from template
    // Template format: odata://CatalogService/books{?filter,orderby,select,skip,top}
    const queryTemplateMatch = this.template.match(/^([^{]+)\{\?([^}]+)\}$/);

    if (!queryTemplateMatch) {
      // No query parameters, treat as static URI
      this.baseUri = this.template;
      this.queryParams = [];
      return;
    }

    this.baseUri = queryTemplateMatch[1];
    this.queryParams = queryTemplateMatch[2]
      .split(",")
      .map((param) => param.trim())
      .filter((param) => param.length > 0);
  }

  /**
   * Matches a URI against this template and extracts variables
   * @param uri The URI to match
   * @returns Object with extracted variables or null if no match
   */
  public match(uri: string): Record<string, string> | null {
    // Check if base URI matches
    if (!uri.startsWith(this.baseUri)) {
      return null;
    }

    // Extract query string
    const queryStart = uri.indexOf("?");
    if (queryStart === -1) {
      // No query parameters in URI
      if (this.queryParams.length === 0) {
        return {}; // Static URI match
      }
      // Template expects query params but URI has none - still valid for optional params
      return {};
    }

    const queryString = uri.substring(queryStart + 1);
    const queryPairs = queryString.split("&");
    const extractedVars: Record<string, string> = {};

    // Parse query parameters with strict validation
    for (const pair of queryPairs) {
      const equalIndex = pair.indexOf("=");
      if (equalIndex > 0) {
        const key = pair.substring(0, equalIndex);
        const value = pair.substring(equalIndex + 1);

        if (key && value !== undefined) {
          const decodedKey = decodeURIComponent(key);
          const decodedValue = decodeURIComponent(value);

          // SECURITY: Reject entire URI if ANY unauthorized parameter is present
          if (!this.queryParams.includes(decodedKey)) {
            return null; // Unauthorized parameter found - reject entire URI
          }

          extractedVars[decodedKey] = decodedValue;
        }
      } else if (pair.trim().length > 0) {
        // Handle malformed parameters (missing = or empty key)
        // SECURITY: Reject malformed query parameters
        return null;
      }
    }

    // For static templates (no parameters allowed), reject any query string
    if (this.queryParams.length === 0 && queryString.trim().length > 0) {
      return null;
    }

    return extractedVars;
  }

  /**
   * Expands the template with given variables
   * @param variables Object containing variable values
   * @returns Expanded URI string
   */
  public expand(variables: Record<string, any>): string {
    if (this.queryParams.length === 0) {
      return this.baseUri;
    }

    const queryPairs: string[] = [];

    for (const param of this.queryParams) {
      const value = variables[param];
      if (value !== undefined && value !== null && value !== "") {
        queryPairs.push(
          `${encodeURIComponent(param)}=${encodeURIComponent(value)}`,
        );
      }
    }

    if (queryPairs.length === 0) {
      return this.baseUri;
    }

    return `${this.baseUri}?${queryPairs.join("&")}`;
  }

  /**
   * Gets the variable names from the template
   */
  get variableNames(): string[] {
    return [...this.queryParams];
  }
}

/**
 * Custom ResourceTemplate that uses our CustomUriTemplate for proper URI matching
 * Duck-types the MCP SDK's ResourceTemplate interface for compatibility
 */
export class CustomResourceTemplate {
  private _uriTemplate: CustomUriTemplate;
  private _callbacks: any;

  constructor(uriTemplate: string, callbacks: any) {
    this._callbacks = callbacks;
    this._uriTemplate = new CustomUriTemplate(uriTemplate);
  }

  /**
   * Gets the URI template pattern - must match MCP SDK interface
   */
  public get uriTemplate(): CustomUriTemplate {
    return this._uriTemplate;
  }

  /**
   * Gets the list callback, if one was provided
   */
  public get listCallback(): any {
    return this._callbacks.list;
  }

  /**
   * Gets the callback for completing a specific URI template variable
   */
  public completeCallback(variable: string): any {
    return this._callbacks.complete?.[variable];
  }
}
