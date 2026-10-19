import { request } from './client';
import type {
  AnswerResponse,
  AnswerUpsertRequest,
  CreateNonConformityRequest,
  Equipment,
  EvidenceResponse,
  InspectionDetail,
  InspectionStatus,
  InspectionSummary,
  NonConformityResponse,
  PageResponse,
  Site,
  TokenResponse,
  UserResponse,
} from './types';

// --- Autenticação ----------------------------------------------------------

export const auth = {
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    }),

  me: () => request<UserResponse>('/auth/me'),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, anonymous: true }),
};

// --- Inspeções -------------------------------------------------------------

export const inspections = {
  list: (params: {
    technicianId?: string;
    siteId?: string;
    status?: InspectionStatus;
    page?: number;
    size?: number;
    sort?: string;
  }) =>
    request<PageResponse<InspectionSummary>>('/inspections', {
      query: {
        technicianId: params.technicianId,
        siteId: params.siteId,
        status: params.status,
        page: params.page ?? 0,
        size: params.size ?? 50,
        sort: params.sort ?? 'scheduledFor,asc',
      },
    }),

  /**
   * Histórico de um ativo. A API filtra inspeções por local, mas não por
   * equipamento, então buscamos o local e refinamos aqui. É correto porque um
   * equipamento pertence a exatamente um local.
   */
  byEquipment: async (siteId: string, equipmentId: string) => {
    const page = await request<PageResponse<InspectionSummary>>('/inspections', {
      query: { siteId, page: 0, size: 100, sort: 'scheduledFor,desc' },
    });
    return page.content.filter((i) => i.equipmentId === equipmentId);
  },

  get: (id: string) => request<InspectionDetail>(`/inspections/${id}`),

  start: (id: string) => request<InspectionDetail>(`/inspections/${id}/start`, { method: 'POST' }),

  submit: (id: string) => request<InspectionDetail>(`/inspections/${id}/submit`, { method: 'POST' }),

  /** Respostas já gravadas — usado para reconciliar depois de sincronizar. */
  answers: (id: string) => request<AnswerResponse[]>(`/inspections/${id}/responses`),

  saveAnswer: (inspectionId: string, answer: AnswerUpsertRequest) =>
    request<AnswerResponse>(`/inspections/${inspectionId}/responses/${answer.inspectionItemId}`, {
      method: 'PUT',
      body: answer,
    }),

  saveAnswers: (inspectionId: string, answers: AnswerUpsertRequest[]) =>
    request<AnswerResponse[]>(`/inspections/${inspectionId}/responses`, {
      method: 'PUT',
      body: { answers },
    }),
};

// --- Evidências ------------------------------------------------------------

export const evidence = {
  list: (inspectionId: string) =>
    request<EvidenceResponse[]>(`/inspections/${inspectionId}/evidence`),

  upload: (
    inspectionId: string,
    photo: { uri: string; name: string; mimeType: string },
    meta: {
      responseId?: string | null;
      nonConformityId?: string | null;
      description?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } = {},
  ) => {
    const form = new FormData();
    // O React Native monta o multipart a partir deste formato de objeto.
    form.append('file', {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    } as unknown as Blob);

    const query: Record<string, string | number | undefined> = {};
    if (meta.responseId) query.responseId = meta.responseId;
    if (meta.nonConformityId) query.nonConformityId = meta.nonConformityId;
    if (meta.description) query.description = meta.description;
    if (meta.latitude != null) query.latitude = meta.latitude;
    if (meta.longitude != null) query.longitude = meta.longitude;

    return request<EvidenceResponse>(`/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      form,
      query,
    });
  },

  remove: (inspectionId: string, evidenceId: string) =>
    request<void>(`/inspections/${inspectionId}/evidence/${evidenceId}`, { method: 'DELETE' }),
};

// --- Não conformidades -----------------------------------------------------

export const nonConformities = {
  list: (inspectionId: string) =>
    request<NonConformityResponse[]>(`/inspections/${inspectionId}/non-conformities`),

  create: (inspectionId: string, body: CreateNonConformityRequest) =>
    request<NonConformityResponse>(`/inspections/${inspectionId}/non-conformities`, {
      method: 'POST',
      body,
    }),
};

// --- Locais ----------------------------------------------------------------

export const sites = {
  get: (id: string) => request<Site>(`/sites/${id}`),

  byClient: (clientId: string) =>
    request<PageResponse<Site>>(`/clients/${clientId}/sites`, { query: { size: 100 } }),
};

// --- Equipamentos ----------------------------------------------------------

export const equipment = {
  get: (id: string) => request<Equipment>(`/equipment/${id}`),

  /** Alvo da tela de scanner: resolve o ativo a partir do conteúdo do QR Code. */
  byQrCode: (qrCode: string) => request<Equipment>(`/equipment/by-qr/${encodeURIComponent(qrCode)}`),

  bySite: (siteId: string) =>
    request<PageResponse<Equipment>>(`/sites/${siteId}/equipment`, { query: { size: 100 } }),
};
