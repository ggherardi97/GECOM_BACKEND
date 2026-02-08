export interface SessionType {
  tenant_id: string;
  user_id: string;
  refresh_token: string;
  ip_address: string;
  device_info: string;
  expires_at: Date;
}
