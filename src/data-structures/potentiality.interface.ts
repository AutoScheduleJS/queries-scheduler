import { ITimeDurationInternal } from '@autoschedule/queries-fn';
import { IPotRange } from './range.interface';

export interface IPotentialityBase {
  readonly isSplittable: boolean;
  readonly queryId: number;
  readonly potentialId: number;
  readonly places: ReadonlyArray<ReadonlyArray<IPotRange>>;
}

export interface IPotentiality extends IPotentialityBase {
  readonly pressure: number;

  /**
   * Should be the target duration.
   */
  readonly duration: ITimeDurationInternal;
}

export interface IPotentialitySimul extends IPotentialityBase {
  readonly duration: number;
  readonly pressure: number;
  readonly [others: string]: any;
}
