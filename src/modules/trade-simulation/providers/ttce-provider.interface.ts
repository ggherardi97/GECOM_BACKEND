import { TtceAuthToken, TtceTaxRequest, TtceTaxResponse } from '../types/ttce.types';

export const TTCE_PROVIDER = 'TTCE_PROVIDER';

export interface ITtceProvider {
  authenticate(): Promise<TtceAuthToken>;
  getTaxes(request: TtceTaxRequest): Promise<TtceTaxResponse>;
}


