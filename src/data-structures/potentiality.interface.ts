import { ITimeDuration } from '@autoschedule/queries-fn';
import { IRange } from './range.interface';

export interface IPotentialityBase {
  readonly isSplittable: boolean;
  readonly queryId: number;
  readonly potentialId: number;
  readonly places: ReadonlyArray<IRange>;
}

export interface IPotentiality extends IPotentialityBase {
  readonly pressure: number;
  readonly duration: ITimeDuration;
}

export interface IPotentialitySimul extends IPotentialityBase {
  readonly duration: number;
  readonly [others: string]: any;
}
