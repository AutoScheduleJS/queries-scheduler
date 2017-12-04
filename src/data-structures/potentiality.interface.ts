import { ITimeDuration } from './query.interface';
import { IRange } from './range.interface';

export interface IPotentiality {
  readonly duration: ITimeDuration;
  readonly isSplittable: boolean;
  readonly name: string;
  readonly places: ReadonlyArray<IRange>;
  readonly pressure: number;
}

export interface IPotentialitySimul {
  readonly duration: number;
  readonly isSplittable: boolean;
  readonly places: ReadonlyArray<IRange>;
  readonly [others: string]: any;
}
