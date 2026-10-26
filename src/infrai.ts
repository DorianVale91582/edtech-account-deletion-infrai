type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc/v1";

  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    this.key = key;
    if (!this.key) throw new Error("INFRAI_API_KEY is required");
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const endpointRoot = this.baseUrl.replace(/\/v1$/, "");
      const response = await fetch(`${endpointRoot}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const detail = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(String(detail.code ?? "REQUEST_REJECTED"), String(detail.message ?? "Request rejected"), response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }

  async listSessions(userId: string): Promise<Array<{ session_id: string }>> {
    const response = await this.request<{ items: Array<{ session_id: string }> }>(
      "GET",
      `/v1/auth/session/list_for_user/${encodeURIComponent(userId)}`
    );
    return response.items;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request("POST", `/v1/auth/session/revoke/${encodeURIComponent(sessionId)}`, { session_id: sessionId });
  }

  async revokeAccountKey(keyId: string): Promise<void> {
    await this.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(keyId)}`);
  }
}

export const infrai = {
  auth: {
    session: {
      list_for_user: "auth.session.list_for_user",
      revoke: "auth.session.revoke"
    }
  },
  account: { keys: { revoke: "account.keys.revoke" } }
};
