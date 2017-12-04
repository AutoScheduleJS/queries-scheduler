import test from 'ava';

import { IPotentiality } from '../data-structures/potentiality.interface';
import { ITimeDuration } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import {
  computePressure,
  // computePressureChunks,
  // materializePotentiality,
  // updatePotentialsPressure,
} from './pipes.flow';

const potentialFactory = (dur: ITimeDuration, places: IRange[]): IPotentiality => {
  return {
    duration: { ...dur },
    isSplittable: false,
    name: 'potential',
    places: [...places],
    pressure: 0,
  };
};

test('will compute pressure', t => {
  t.true(computePressure(potentialFactory({ min: 1, target: 1 }, [{ end: 1, start: 0 }])) === 1);
  t.true(computePressure(potentialFactory({ min: 0, target: 1 }, [{ end: 1, start: 0 }])) === 0.5);
  t.true(computePressure(potentialFactory({ min: 0, target: 1 }, [{ end: 2, start: 0 }])) === 0.25);
  t.true(computePressure(potentialFactory({ min: 1, target: 1 }, [{ end: 2, start: 0 }])) === 0.5);
});
