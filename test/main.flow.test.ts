import * as Q from '@autoschedule/queries-fn';
import { queryToStatePotentials } from '@autoschedule/userstate-manager';
import test, { TestContext } from 'ava';
import * as moment from 'moment';
import { Observable, of } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { getSchedule$ } from '../src/data-flows/main.flow';
import { IConfig } from '../src/data-structures/config.interface';
import { IMaterial } from '../src/data-structures/material.interface';

type queriesObj = Array<{ readonly id: number; readonly queries: ReadonlyArray<Q.IQueryInternal> }>;

const stateManager = queryToStatePotentials([]);

const askDetails = (fn: (s: ReadonlyArray<IMaterial>) => queriesObj) => (
  s: ReadonlyArray<IMaterial>
): queriesObj => {
  return fn(s);
};
const conflictResolver = (
  fn: (q: ReadonlyArray<Q.IQueryInternal>, e: any) => ReadonlyArray<Q.IQueryInternal>
) => (
  queries: ReadonlyArray<Q.IQueryInternal>,
  error: any
): Observable<ReadonlyArray<Q.IQueryInternal>> => {
  return of(fn(queries, error));
};
const toEmpty = () => [];
const dur = moment.duration;
const config: IConfig = { endDate: +moment().add(1, 'days'), startDate: Date.now() };

const testStartEnd = (t: TestContext, start: number, end: number, m: IMaterial) => {
  t.is(m.start, start);
  t.is(m.end, end);
};

test('will compute zero queries', t => {
  t.plan(1);
  return getSchedule$(askDetails(toEmpty), conflictResolver(toEmpty), config)(stateManager)(
    []
  ).pipe(
    map(s => t.is(s.length, 0)),
    take(1)
  );
});

test('will compute one query', t => {
  const durTarget = +dur(1.5, 'hours');
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.positionHelper(Q.duration(durTarget, +dur(1, 'hours')))),
  ];
  let i = 0;
  return getSchedule$(
    askDetails(s => {
      if (i > 0) {
        return [];
      }
      t.is(s.length, 1);
      i++;
      testStartEnd(t, config.startDate, config.startDate + durTarget, s[0]);
      return [
        {
          id: 72,
          queries: [],
        },
      ];
    }),
    conflictResolver(_ => {
      t.fail('should not have conflict');
      return [];
    }),
    config
  )(stateManager)(queries).pipe(
    map(s => {
      if (s.length === 0) {
        return;
      }
      t.is(s.length, 1);
      testStartEnd(t, config.startDate, config.startDate + durTarget, s[0]);
    }),
    take(1)
  );
});

test('will catch errors', t => {
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.positionHelper(Q.start(config.startDate), Q.end(config.endDate - 1))),
    Q.queryFactory(Q.id(2), Q.positionHelper(Q.start(config.startDate), Q.end(config.endDate - 1))),
  ];
  return getSchedule$(
    askDetails(s => {
      t.is(s.length, 2);
      testStartEnd(t, config.startDate, config.startDate + 1000, s[0]);
      testStartEnd(t, config.startDate + 1001, config.endDate - 1, s[1]);
      return [];
    }),
    conflictResolver(() => {
      return [
        Q.queryFactory(
          Q.id(1),
          Q.positionHelper(Q.start(config.startDate), Q.end(config.startDate + 1000))
        ),
        Q.queryFactory(
          Q.id(2),
          Q.positionHelper(Q.start(config.startDate + 1001), Q.end(config.endDate - 1))
        ),
      ];
    }),
    config
  )(stateManager)(queries).pipe(
    map(s => {
      t.is(s.length, 2);
      testStartEnd(t, config.startDate, config.startDate + 1000, s[0]);
      testStartEnd(t, config.startDate + 1001, config.endDate - 1, s[1]);
    }),
    take(1)
  );
});

test('will change query', t => {
  const durTarget = +dur(1.5, 'hours');
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.positionHelper(Q.duration(durTarget, +dur(1, 'hours')))),
  ];
  let iteration = 0;
  return getSchedule$(
    askDetails(s => {
      t.is(s.length, 1);
      if (iteration > 0) {
        return [];
      }
      testStartEnd(t, config.startDate, config.startDate + durTarget, s[0]);
      iteration++;
      return [
        {
          id: 1,
          queries: [
            Q.queryFactory(
              Q.id(2),
              Q.positionHelper(Q.start(config.startDate + 1000), Q.end(config.endDate - 1000))
            ),
          ],
        },
        {
          id: 2,
          queries: [],
        },
      ];
    }),
    conflictResolver(_ => {
      t.fail('should not have conflict');
      return [];
    }),
    config
  )(stateManager)(queries).pipe(
    map(s => {
      t.is(s.length, 1);
      t.is(s[0].queryId, 2);
      testStartEnd(t, config.startDate + 1000, config.endDate - 1000, s[0]);
    }),
    take(1)
  );
});
