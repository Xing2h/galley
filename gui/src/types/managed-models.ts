export type ManagedModelProtocol = "anthropic" | "openai";

export type ManagedModelCredentialStatus = "present" | "missing" | "unknown";

export interface ManagedModelProviderRecord {
  id: string;
  displayName: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  apiKeyRef: string;
  credentialStatus: ManagedModelCredentialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SaveManagedProviderInput {
  id?: string;
  displayName?: string;
  protocol: ManagedModelProtocol;
  apiBase: string;
  apiKey?: string;
}

export interface ManagedModelRecord {
  id: string;
  providerId: string;
  providerDisplayName: string;
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
  providerId: string;
  displayName?: string;
  model: string;
  advancedOptions?: Record<string, unknown>;
  makeDefault?: boolean;
}

export interface ManagedModelProbeInput {
  id?: string;
  providerId?: string;
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
