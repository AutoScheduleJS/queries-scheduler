import test from 'ava';
import * as R from 'ramda';

import { atomicToPotentiality } from './queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { QueryKind } from '../data-structures/query.enum';
import { IQuery, ITimeBoundary, ITimeDuration } from '../data-structures/query.interface';

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
const duration = (target: number, minTime?: number): Record<'duration', ITimeDuration> => {
  const min = minTime || target;
  return {
    duration: {
      min,
      target,
    },
  };
};

const queryFactory = (...factories: Array<Partial<IQuery>>): IQuery => {
  return R.mergeAll([id(), name(), kind(), ...factories]) as IQuery;
};

test('will convert atomic to potentiality (start, duration)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: IQuery = queryFactory(start(5), duration(1));
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
