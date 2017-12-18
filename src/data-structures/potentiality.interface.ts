import { ITimeDuration } from '@autoschedule/queries-fn';
import { IRange } from './range.interface';

export interface IPotentiality {
  readonly duration: ITimeDuration;
  readonly isSplittable: boolean;
  readonly queryId: number;
  readonly potentialId: number;
  readonly places: ReadonlyArray<IRange>;
  readonly pressure: number;
}

export interface IPotentialitySimul {
  readonly duration: number;
  readonly isSplittable: boolean;
  readonly queryId: number;
  readonly potentialId: number;
  readonly places: ReadonlyArray<IRange>;
  readonly [others: string]: any;
}
