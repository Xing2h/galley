export type ManagedModelProtocol = "anthropic" | "openai";

export type ManagedModelCredentialStatus = "present" | "missing" | "unknown";

export interface ManagedModelRecord {
  id: string;
  displayName: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  model: string;
  apiKeyRef: string;
  advancedOptions: Record<string, unknown>;
  isDefault: boolean;
  credentialStatus: ManagedModelCredentialStatus;
  lastValidatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveManagedModelInput {
  id?: string;
  displayName?: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  model: string;
  apiKey?: string;
  makeDefault?: boolean;
}

export interface ManagedModelProbeInput {
  id?: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  apiKey?: string;
  model?: string;
}

export interface ManagedModelListResult {
  models: string[];
  endpoint: string;
}

export interface ManagedModelConnectionResult {
  ok: boolean;
  endpoint: string;
  modelFound?: boolean | null;
  message: string;
}
