import test from 'ava';
import * as R from 'ramda';

import {
  atomicToPotentiality,
  goalToPotentiality,
  mapToHourRange,
  mapToMonthRange,
  mapToTimeRestriction,
  mapToWeekdayRange,
} from './queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { GoalKind, QueryKind, RestrictionCondition } from '../data-structures/query.enum';
import { IGoal, IQuery, ITimeBoundary, ITimeDuration } from '../data-structures/query.interface';

const name = (nameStr?: string): Record<'name', string> => ({ name: nameStr || 'query' });
const kind = (kindQK?: QueryKind): Record<'kind', QueryKind> => ({
  kind: kindQK != null ? kindQK : QueryKind.Atomic,
});
const id = (idNb?: number): Record<'id', number> => ({ id: idNb || 42 });
const tb = <T extends 'start' | 'end'>(t: T) => (
  target: number,
  minTime?: number
): Record<T, ITimeBoundary> => {
  const min = minTime || target;
  return R.assoc(
    t,
    {
      max: target,
      min,
      target,
    },
    {}
  );
};
const start = tb('start');
const end = tb('end');
const timeDuration = (target: number, minTime?: number): ITimeDuration => {
  const min = minTime || target;
  return { min, target };
};
const duration = (dur: ITimeDuration): Record<'duration', ITimeDuration> => {
  return R.assoc('duration', dur, {});
};
const timeRestriction = (
  condition: RestrictionCondition,
  ranges: ReadonlyArray<[number, number]>
) => {
  return {
    condition,
    ranges,
  };
};
const goal = (kindEn: GoalKind, quantity: ITimeDuration, time: number): Record<'goal', IGoal> => ({
  goal: { kind: kindEn, quantity, time },
});
const queryFactory = (...factories: Array<Partial<IQuery>>): IQuery => {
  return R.mergeAll([id(), name(), kind(), ...factories]) as IQuery;
};

test('will map nothing when no timeRestrictions', t => {
  const startNb = new Date().setHours(0, 0, 0, 0);
  const endNb = startNb + 1 * 24 * 3600000;
  const tr = timeRestriction(RestrictionCondition.InRange, []);
  const result1 = mapToTimeRestriction(tr, mapToHourRange)([{ end: endNb, start: startNb }]);
  const result2 = mapToTimeRestriction(undefined, mapToHourRange)([{ end: endNb, start: startNb }]);

  t.true(result1.length === 0);
  t.true(result2.length === 1);
  t.true(result2[0].start === startNb);
  t.true(result2[0].end === endNb);
});

test('will map from hour timeRestrictions', t => {
  const startNb = new Date().setHours(0, 0, 0, 0);
  const endNb = startNb + 1 * 24 * 3600000;
  const tr1 = timeRestriction(RestrictionCondition.InRange, [[5, 13]]);
  const tr2 = timeRestriction(RestrictionCondition.OutRange, [[5, 13]]);
  const result1 = mapToTimeRestriction(tr1, mapToHourRange)([{ end: endNb, start: startNb }]);
  const result2 = mapToTimeRestriction(tr2, mapToHourRange)([{ end: endNb, start: startNb }]);

  t.true(result1.length === 1);
  t.true(result1[0].start === startNb + 5 * 3600000);
  t.true(result1[0].end === startNb + 13 * 3600000);

  t.true(result2.length === 2);
  t.true(result2[0].start === startNb);
  t.true(result2[0].end === startNb + 5 * 3600000);
  t.true(result2[1].start === startNb + 13 * 3600000);
  t.true(result2[1].end === endNb);
});

test('will map from weekday timeRestrictions when during range', t => {
  const startNb = +new Date(2017, 11, 3, 0, 0, 0, 0);
  const endNb = +new Date(2017, 11, 9, 0, 0, 0, 0);
  const tr1 = timeRestriction(RestrictionCondition.InRange, [[3, 6]]);
  const result1 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end: endNb, start: startNb }]);

  t.true(result1.length === 1);
  t.true(new Date(result1[0].start).getDay() === 3);
  t.true(new Date(result1[0].end).getDay() === 6);
});

test('will map from weekday timeRestrictions when overlapping range', t => {
  const startNb1 = +new Date(2017, 11, 7, 0, 0, 0, 0);
  const endNb1 = +new Date(2017, 11, 9, 0, 0, 0, 0);
  const startNb2 = +new Date(2017, 11, 3, 0, 0, 0, 0);
  const endNb2 = +new Date(2017, 11, 8, 0, 0, 0, 0);
  const tr1 = timeRestriction(RestrictionCondition.InRange, [[3, 6]]);
  const result1 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end: endNb1, start: startNb1 }]);
  const result2 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end: endNb2, start: startNb2 }]);

  t.true(result1.length === 1);
  t.true(new Date(result1[0].start).getDay() === 4);
  t.true(new Date(result1[0].end).getDay() === 6);
  t.true(result2.length === 1);
  t.true(new Date(result2[0].start).getDay() === 3);
  t.true(new Date(result2[0].end).getDay() === 5);
});

test('will map from month timeRestrictions when during range', t => {
  const startNb = +new Date(2017, 0, 1, 0, 0, 0, 0);
  const endNb = +new Date(2017, 11, 31, 0, 0, 0, 0);
  const tr1 = timeRestriction(RestrictionCondition.InRange, [[6, 7]]);
  const result1 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end: endNb, start: startNb }]);

  t.true(result1.length === 1);
  t.true(new Date(result1[0].start).getMonth() === 6);
  t.true(new Date(result1[0].end).getMonth() === 7);
});

test('will map from month timeRestrictions when overlapping range', t => {
  const startNb1 = +new Date(2017, 6, 1, 0, 0, 0, 0);
  const startNb2 = +new Date(2017, 1, 1, 0, 0, 0, 0);
  const endNb1 = +new Date(2017, 11, 31, 0, 0, 0, 0);
  const endNb2 = +new Date(2017, 6, 31, 0, 0, 0, 0);
  const tr1 = timeRestriction(RestrictionCondition.InRange, [[4, 7]]);
  const result1 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end: endNb1, start: startNb1 }]);
  const result2 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end: endNb2, start: startNb2 }]);

  t.true(result1.length === 1);
  t.true(new Date(result1[0].start).getMonth() === 6);
  t.true(new Date(result1[0].end).getMonth() === 7);
  t.true(result1.length === 1);
  t.true(new Date(result2[0].end).getMonth() === 6);
  t.true(new Date(result2[0].start).getMonth() === 4);
});

test('will convert atomic to potentiality (start, duration)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: IQuery = queryFactory(start(5), duration(timeDuration(1)));
  const pot = atomicToPotentiality(config)(atomic);

  t.true(pot.length === 1);
  t.false(pot[0].isSplittable);
  t.true(pot[0].places.length === 1);
  t.true(pot[0].places[0].start === 5);
  t.true(pot[0].places[0].end === 10);
  t.true(pot[0].duration.target === 1);
});

test('will convert atomic to potentiality (start, end)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: IQuery = queryFactory(start(5), end(6));
  const pot = atomicToPotentiality(config)(atomic);

  t.true(pot.length === 1);
  t.false(pot[0].isSplittable);
  t.true(pot[0].places.length === 1);
  t.true(pot[0].places[0].start === 5);
  t.true(pot[0].places[0].end === 6);
  t.true(pot[0].duration.target === 1);
});

test('will convert goal to potentiality', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const qgoal1: IQuery = queryFactory(goal(GoalKind.Atomic, timeDuration(2), 5));
  const qgoal2: IQuery = queryFactory(goal(GoalKind.Splittable, timeDuration(2.5), 2.5));
  const pot1 = goalToPotentiality(config)(qgoal1);
  const pot2 = goalToPotentiality(config)(qgoal2);
  const testPoten = (poten: IPotentiality[]) => {
    t.true(poten.length === 4);
    t.true(poten[0].places.length === 1);
    t.true(poten[0].places[0].start === 0);
    t.true(poten[0].places[0].end === 2.5);
    t.true(poten[1].places.length === 1);
    t.true(poten[1].places[0].start === 2.5);
    t.true(poten[1].places[0].end === 5);
  };
  testPoten(pot1);
  testPoten(pot2);
});
