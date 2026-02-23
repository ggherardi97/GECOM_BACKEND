export type TtceTaxRequest = {
  ncm: string;
  originCountry?: string;
  customsValue: string;
  currency: string;
  destinationState?: string;
};

export type TtceNormalizedTax = {
  taxType: string;
  rate?: string;
  baseAmountBrl?: string;
  amountBrl: string;
};

export type TtceTaxResponse = {
  taxes: TtceNormalizedTax[];
  raw?: unknown;
};

export type TtceAuthToken = {
  jwt: string;
  csrf: string;
  expiresAt?: Date;
};


