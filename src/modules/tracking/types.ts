export type TrackingMode = 'AIR' | 'SEA';

export type TrackingStatus = 'UNKNOWN' | 'IN_TRANSIT' | 'ARRIVED' | 'DELAYED' | 'CANCELLED';

export type TrackingProviderName = 'FR24' | 'MARINETRAFFIC';

export interface TrackingPoint {
  lat: number;
  lon: number;
  timestamp: string;
  speedKts?: number;
  altitudeFt?: number;
  headingDeg?: number;
  source: 'FR24' | 'MT';
}

export interface TrackingSnapshot {
  mode: TrackingMode;
  status: TrackingStatus;
  current?: TrackingPoint;
  route?: TrackingPoint[];
  eta?: string;
  meta?: Record<string, any>;
}

export interface ProviderSnapshotInput {
  tenantId: string;
  transportId: string;
  externalId: string;
  apiKey: string;
}

export interface TrackingProvider {
  readonly provider: TrackingProviderName;
  readonly mode: TrackingMode;
  fetchSnapshot(input: ProviderSnapshotInput): Promise<TrackingSnapshot>;
}
