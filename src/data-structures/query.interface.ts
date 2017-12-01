import { GoalKind, QueryKind, RestrictionCondition } from './query.enum';

export interface IGoal {
  readonly kind: GoalKind;
  readonly quantity: ITimeDuration;
  readonly time: number;
}

export interface ITimeDuration {
  readonly min: number;
  readonly target: number;
}

export interface ITimeBoundary {
  readonly min?: number;
  readonly target?: number;
  readonly max?: number;
}

export interface ITimeRestriction {
  readonly condition: RestrictionCondition;
  readonly ranges: ReadonlyArray<[number, number]>;
}

export interface ITimeRestrictions {
  readonly hour?: ITimeRestriction;
  readonly weekday?: ITimeRestriction;
  readonly month?: ITimeRestriction;
}

export interface IQuery {
  readonly id: number;
  readonly name: string;
  readonly kind: QueryKind;
  readonly duration?: ITimeDuration;
  readonly start?: ITimeBoundary;
  readonly end?: ITimeBoundary;
  readonly goal?: IGoal;
  readonly timeRestrictions?: ITimeRestrictions;
}
