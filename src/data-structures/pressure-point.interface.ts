export interface IPressurePoint {
  readonly time: number;
  readonly pressureDiff: number;
}

export interface IPressureChunkPoint {
  readonly start: number;
  readonly pressure: number;
}
