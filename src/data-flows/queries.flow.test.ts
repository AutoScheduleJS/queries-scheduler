import test from 'ava';

import { atomicToPotentiality } from './queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { QueryKind } from '../data-structures/query.enum';
import { IQuery } from '../data-structures/query.interface';

const atomicFactory = (start: number, durationMin: number, durationTarget?: number): IQuery => ({
  duration: { min: durationMin, target: durationTarget ? durationTarget : durationMin },
  id: 42,
  kind: QueryKind.Atomic,
  name: 'query-42',
  start: { target: start },
});

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
