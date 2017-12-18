import * as Q from '@autoschedule/queries-fn';
import test from 'ava';

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

test('will map nothing when no timeRestrictions', t => {
  const start = new Date().setHours(0, 0, 0, 0);
  const end = start + 1 * 24 * 3600000;
  const tr = Q.timeRestriction(Q.RestrictionCondition.InRange, []);
  const result1 = mapToTimeRestriction(tr, mapToHourRange)([{ end, start }]);
  const result2 = mapToTimeRestriction(undefined, mapToHourRange)([{ end, start }]);

  t.is(result1.length, 0);
  t.is(result2.length, 1);
  t.is(result2[0].start, start);
  t.is(result2[0].end, end);
});

test('will map from hour timeRestrictions', t => {
  const start = new Date().setHours(0, 0, 0, 0);
  const end = start + 1 * 24 * 3600000;
  const tr1 = Q.timeRestriction(Q.RestrictionCondition.InRange, [[5, 13]]);
  const tr2 = Q.timeRestriction(Q.RestrictionCondition.OutRange, [[5, 13]]);
  const result1 = mapToTimeRestriction(tr1, mapToHourRange)([{ end, start }]);
  const result2 = mapToTimeRestriction(tr2, mapToHourRange)([{ end, start }]);

  t.is(result1.length, 1);
  t.is(result1[0].start, start + 5 * 3600000);
  t.is(result1[0].end, start + 13 * 3600000);

  t.is(result2.length, 2);
  t.is(result2[0].start, start);
  t.is(result2[0].end, start + 5 * 3600000);
  t.is(result2[1].start, start + 13 * 3600000);
  t.is(result2[1].end, end);
});

test('will map from weekday timeRestrictions when during range', t => {
  const start = +new Date(2017, 11, 3, 0, 0, 0, 0);
  const end = +new Date(2017, 11, 9, 0, 0, 0, 0);
  const tr1 = Q.timeRestriction(Q.RestrictionCondition.InRange, [[3, 6]]);
  const result1 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end, start }]);

  t.is(result1.length, 1);
  t.is(new Date(result1[0].start).getDay(), 3);
  t.is(new Date(result1[0].end).getDay(), 6);
});

test('will map from weekday timeRestrictions when overlapping range', t => {
  const start1 = +new Date(2017, 11, 7, 0, 0, 0, 0);
  const end1 = +new Date(2017, 11, 9, 0, 0, 0, 0);
  const start2 = +new Date(2017, 11, 3, 0, 0, 0, 0);
  const end2 = +new Date(2017, 11, 8, 0, 0, 0, 0);
  const tr1 = Q.timeRestriction(Q.RestrictionCondition.InRange, [[3, 6]]);
  const result1 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end: end1, start: start1 }]);
  const result2 = mapToTimeRestriction(tr1, mapToWeekdayRange)([{ end: end2, start: start2 }]);

  t.is(result1.length, 1);
  t.is(new Date(result1[0].start).getDay(), 4);
  t.is(new Date(result1[0].end).getDay(), 6);
  t.is(result2.length, 1);
  t.is(new Date(result2[0].start).getDay(), 3);
  t.is(new Date(result2[0].end).getDay(), 5);
});

test('will map from month timeRestrictions when during range', t => {
  const start = +new Date(2017, 0, 1, 0, 0, 0, 0);
  const end = +new Date(2017, 11, 31, 0, 0, 0, 0);
  const tr1 = Q.timeRestriction(Q.RestrictionCondition.InRange, [[6, 7]]);
  const result1 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end, start }]);

  t.is(result1.length, 1);
  t.is(new Date(result1[0].start).getMonth(), 6);
  t.is(new Date(result1[0].end).getMonth(), 7);
});

test('will map from month timeRestrictions when overlapping range', t => {
  const start1 = +new Date(2017, 6, 1, 0, 0, 0, 0);
  const start2 = +new Date(2017, 1, 1, 0, 0, 0, 0);
  const end1 = +new Date(2017, 11, 31, 0, 0, 0, 0);
  const end2 = +new Date(2017, 6, 31, 0, 0, 0, 0);
  const tr1 = Q.timeRestriction(Q.RestrictionCondition.InRange, [[4, 7]]);
  const result1 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end: end1, start: start1 }]);
  const result2 = mapToTimeRestriction(tr1, mapToMonthRange)([{ end: end2, start: start2 }]);

  t.is(result1.length, 1);
  t.is(new Date(result1[0].start).getMonth(), 6);
  t.is(new Date(result1[0].end).getMonth(), 7);
  t.is(result1.length, 1);
  t.is(new Date(result2[0].end).getMonth(), 6);
  t.is(new Date(result2[0].start).getMonth(), 4);
});

test('will convert atomic to potentiality (start, duration)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: Q.IAtomicQuery = Q.queryFactory<Q.IAtomicQuery>(
    Q.start(5),
    Q.duration(Q.timeDuration(1))
  );
  const pot = atomicToPotentiality(config, [])(atomic);

  t.is(pot.length, 1);
  t.false(pot[0].isSplittable);
  t.is(pot[0].places.length, 1);
  t.is(pot[0].places[0].start, 5);
  t.is(pot[0].places[0].end, 10);
  t.is(pot[0].duration.target, 1);
});

test('will convert atomic to potentiality (start, end)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: Q.IAtomicQuery = Q.queryFactory<Q.IAtomicQuery>(Q.start(5), Q.end(6));
  const pot = atomicToPotentiality(config, [])(atomic);

  t.is(pot.length, 1);
  t.false(pot[0].isSplittable);
  t.is(pot[0].places.length, 1);
  t.is(pot[0].places[0].start, 5);
  t.is(pot[0].places[0].end, 6);
  t.is(pot[0].duration.target, 1);
  t.is(pot[0].duration.min, 1);
});

test('will convert goal to potentiality', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const qgoal1: Q.IGoalQuery = Q.queryFactory<Q.IGoalQuery>(
    Q.goal(Q.GoalKind.Atomic, Q.timeDuration(2), 5)
  );
  const qgoal2: Q.IGoalQuery = Q.queryFactory<Q.IGoalQuery>(
    Q.goal(Q.GoalKind.Splittable, Q.timeDuration(2.5), 2.5)
  );
  const pot1 = goalToPotentiality(config)(qgoal1);
  const pot2 = goalToPotentiality(config)(qgoal2);
  const testPoten = (poten: IPotentiality[]) => {
    t.is(poten.length, 4);
    t.is(poten[0].places.length, 1);
    t.is(poten[0].places[0].start, 0);
    t.is(poten[0].places[0].end, 2.5);
    t.is(poten[1].places.length, 1);
    t.is(poten[1].places[0].start, 2.5);
    t.is(poten[1].places[0].end, 5);
  };
  testPoten(pot1);
  testPoten(pot2);
});
