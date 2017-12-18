import { IRange } from './range.interface';

export interface IMaterial extends IRange {
  readonly queryId: number;
  readonly materialId: number;
}
