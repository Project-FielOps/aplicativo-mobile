/**
 * Espelho dos DTOs da FieldOps API (`API/src/main/java/com/fieldops/**\/dto`).
 * Mantido manualmente e alinhado ao contrato real — não ao protótipo, que usa
 * dados fictícios.
 */

export type Role = 'ADMIN' | 'SUPERVISOR' | 'TECHNICIAN' | 'CLIENT_VIEWER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export type InspectionStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Conformity = 'NOT_APPLICABLE' | 'CONFORMING' | 'NON_CONFORMING';

export type ResponseType =
  | 'TEXT_SHORT'
  | 'TEXT_LONG'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'CONFORMITY'
  | 'SINGLE_CHOICE'
  | 'DATE';

export type NonConformitySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type NonConformityStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';
export type EquipmentStatus = 'ACTIVE' | 'INACTIVE';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface InspectionSummary {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  siteId: string | null;
  siteName: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  technicianId: string | null;
  technicianName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  priority: Priority;
  status: InspectionStatus;
  scheduledFor: string | null;
  templateVersionNumber: number | null;
  templateTitle: string | null;
}

export interface AnswerResponse {
  id: string;
  inspectionItemId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueJson: string | null;
  observation: string | null;
  conformity: Conformity | null;
  answeredBy: string | null;
  serverReceivedAt: string | null;
  version: number;
}

export interface ItemSnapshot {
  id: string;
  sectionTitle: string;
  sectionDescription: string | null;
  sectionOrder: number;
  itemCode: string | null;
  itemTitle: string;
  itemDescription: string | null;
  responseType: ResponseType;
  required: boolean;
  rulesJson: string | null;
  optionsJson: string | null;
  itemOrder: number;
  answer: AnswerResponse | null;
}

export interface InspectionDetail {
  id: string;
  templateVersionId: string | null;
  templateId: string | null;
  templateVersionNumber: number | null;
  templateTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  siteId: string | null;
  siteName: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  technicianId: string | null;
  technicianName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  createdBy: string | null;
  title: string;
  instructions: string | null;
  priority: Priority;
  status: InspectionStatus;
  scheduledFor: string | null;
  startedAtServer: string | null;
  submittedAtServer: string | null;
  approvedAt: string | null;
  canceledAt: string | null;
  canceledBy: string | null;
  canceledReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  items: ItemSnapshot[];
}

/** Corpo aceito por PUT /inspections/{id}/responses/{itemId}. */
export interface AnswerUpsertRequest {
  inspectionItemId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: string | null;
  valueJson?: string | null;
  observation?: string | null;
  conformity?: Conformity | null;
}

export interface EvidenceResponse {
  id: string;
  inspectionId: string;
  responseId: string | null;
  nonConformityId: string | null;
  type: 'PHOTO';
  originalFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  uploadedAt: string;
  createdBy: string | null;
}

export interface NonConformityResponse {
  id: string;
  inspectionId: string;
  inspectionItemId: string | null;
  responseId: string | null;
  title: string;
  description: string | null;
  severity: NonConformitySeverity;
  status: NonConformityStatus;
  createdBy: string | null;
  createdAt: string;
  version: number;
}

export interface CreateNonConformityRequest {
  inspectionItemId?: string | null;
  responseId?: string | null;
  title: string;
  description?: string | null;
  severity: NonConformitySeverity;
}

export interface Equipment {
  id: string;
  siteId: string | null;
  siteName: string | null;
  clientId: string | null;
  clientName: string | null;
  name: string;
  assetNumber: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  qrCode: string | null;
  status: EquipmentStatus;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type ReviewDecision = 'APPROVED' | 'REJECTED';

/** Um parecer do supervisor sobre a inspeção. Há um por ciclo de revisão. */
export interface InspectionReview {
  id: string;
  inspectionId: string;
  reviewerId: string | null;
  reviewerName: string | null;
  decision: ReviewDecision;
  reason: string | null;
  comments: string | null;
  reviewedAt: string | null;
  reviewCycle: number | null;
}

export interface Client {
  id: string;
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface Template {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  currentVersion: number | null;
  hasOpenDraft: boolean;
}

/** Agendamento de inspeção — o que o supervisor preenche antes do campo. */
export interface CreateInspectionRequest {
  templateId: string;
  templateVersionNumber?: number | null;
  clientId: string;
  siteId: string;
  equipmentId?: string | null;
  technicianId: string;
  supervisorId: string;
  title: string;
  instructions?: string | null;
  priority: Priority;
  /** ISO-8601 em UTC. */
  scheduledFor: string;
}

/**
 * Local do cliente. O app usa o endereço e as coordenadas para abrir a rota no
 * mapa — é o que leva o técnico até o ativo.
 */
export interface Site {
  id: string;
  clientId: string | null;
  clientName: string | null;
  name: string;
  description: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Corpo de erro padronizado da API (`ApiError`). */
export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  code: string;
  message: string;
  path: string;
  details?: Record<string, string> | null;
}
