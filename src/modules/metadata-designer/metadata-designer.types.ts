export type MetadataEntityType = 'CUSTOM' | 'CORE';

export type MetadataFieldDataType =
  | 'STRING'
  | 'TEXT'
  | 'INT'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'UUID'
  | 'JSONB'
  | 'LOOKUP';

export type MetadataFieldSource = 'SYSTEM' | 'CORE_EXISTING' | 'DESIGNER';
export type MetadataLookupOnDelete = 'RESTRICT' | 'CASCADE' | 'SET_NULL';
export type MetadataFormType = 'MAIN' | 'QUICK_CREATE' | 'SIDE_PANEL_CREATE';
export type MetadataPublishStatus = 'SUCCESS' | 'FAILED';

export type MetadataPrincipalType = 'ROLE' | 'USER';
export type MetadataMaskMode = 'NONE' | 'STARS' | 'HIDDEN_TEXT';

export type MetadataAuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

export type FieldPermission = {
  can_view: boolean;
  can_read: boolean;
  can_edit: boolean;
  mask_mode: MetadataMaskMode;
  read_only: boolean;
};

