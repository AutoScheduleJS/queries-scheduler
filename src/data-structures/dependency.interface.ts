import { IRange } from './range.interface';

export interface IPotDependency {
  readonly places: ReadonlyArray<IRange>;
  readonly potentialId: number;
  readonly queryId: number;
}

export interface IMatDependency extends IPotDependency {
  readonly splitId?: number;
}