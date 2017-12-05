import test from 'ava';
import * as R from 'ramda';

import { atomicToPotentiality } from './queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { QueryKind } from '../data-structures/query.enum';
import { IQuery } from '../data-structures/query.interface';

const recordField = <T extends keyof IQuery>(field: T, params: Partial<IQuery>, def: any) =>
  R.assoc(field, R.propOr(def, field, params), {});

const idDefault = (params: Partial<IQuery>): Record<'id', number> => recordField('id', params, 42);

const atomicFactory = R.pipe(R.ap([idDefault]), R.mergeAll);

test('will convert atomic to potentiality (start, duration)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: IQuery = atomicFactory(5, 1);
  const pot = atomicToPotentiality(config)(atomic);
  t.true(pot.length === 1);
  t.false(pot[0].isSplittable);
  t.true(pot[0].places.length === 1);
  t.true(pot[0].places[0].start === 5);
  t.true(pot[0].places[0].end === 10);
});

test('will convert atomic to potentiality (start, end)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const atomic: IQuery = atomicFactory(5, 1);
  const pot = atomicToPotentiality(config)(atomic);
  t.true(pot.length === 1);
  t.false(pot[0].isSplittable);
  t.true(pot[0].places.length === 1);
  t.true(pot[0].places[0].start === 5);
  t.true(pot[0].places[0].end === 10);
});
