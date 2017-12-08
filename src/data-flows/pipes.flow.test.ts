import test from 'ava';
import { isEqual } from 'intervals-fn';

import { IConfig } from '../data-structures/config.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { ITimeDuration } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import {
  computePressure,
  computePressureChunks,
  materializePotentiality,
  updatePotentialsPressure,
} from './pipes.flow';

const potentialFactory = (
  dur: ITimeDuration,
  places: IRange[],
  pressure?: number
): IPotentiality => {
  return {
    duration: { ...dur },
    isSplittable: false,
    name: 'potential',
    places: [...places],
    pressure: pressure || 0,
  };
};

test('will compute pressure', t => {
  t.true(computePressure(potentialFactory({ min: 1, target: 1 }, [{ end: 1, start: 0 }])) === 1);
  t.true(computePressure(potentialFactory({ min: 0, target: 1 }, [{ end: 1, start: 0 }])) === 0.5);
  t.true(computePressure(potentialFactory({ min: 0, target: 1 }, [{ end: 2, start: 0 }])) === 0.25);
  t.true(computePressure(potentialFactory({ min: 1, target: 1 }, [{ end: 2, start: 0 }])) === 0.5);
  t.true(
    computePressure(
      potentialFactory({ min: 1, target: 1 }, [{ end: 1, start: 0 }, { end: 2, start: 1 }])
    ) === 0.5
  );
});

test('will compute pressure chunks when no potential', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunk = computePressureChunks(config, []);
  t.true(pChunk.length === 1);
  t.true(isEqual({ start: 0, end: 10 }, pChunk[0]) && pChunk[0].pressure === 0);
});

test('will compute simple pressure chunks', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunks = computePressureChunks(config, [
    potentialFactory({ min: 1, target: 1 }, [{ end: 2, start: 1 }], 1),
  ]);
  t.true(pChunks.length === 3);
  t.true(isEqual({ start: 0, end: 1 }, pChunks[0]) && pChunks[0].pressure === 0);
  t.true(isEqual({ start: 1, end: 2 }, pChunks[1]) && pChunks[1].pressure === 1);
  t.true(isEqual({ start: 2, end: 10 }, pChunks[2]) && pChunks[2].pressure === 0);
});

test('will simplify pressure chunks', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunkA = computePressureChunks(config, [
    potentialFactory({ min: 0, target: 1 }, [{ end: 2, start: 1 }], 0.5),
    potentialFactory({ min: 2, target: 2 }, [{ end: 3, start: 1 }], 1),
  ]);
  t.true(pChunkA.length === 4);
  t.true(isEqual({ start: 0, end: 1 }, pChunkA[0]) && pChunkA[0].pressure === 0);
  t.true(isEqual({ start: 1, end: 2 }, pChunkA[1]) && pChunkA[1].pressure === 1.5);
  t.true(isEqual({ start: 2, end: 3 }, pChunkA[2]) && pChunkA[2].pressure === 1);
  t.true(isEqual({ start: 3, end: 10 }, pChunkA[3]) && pChunkA[3].pressure === 0);

  const pChunkB = computePressureChunks(config, [
    potentialFactory({ min: 5, target: 10 }, [{ end: 10, start: 0 }], 0.75),
  ]);
  t.true(pChunkB.length === 1);
  t.true(isEqual({ start: 0, end: 10 }, pChunkB[0]) && pChunkB[0].pressure === 0.75);
});

test('will update potentials pressure', t => {
  const pots = [potentialFactory({ min: 2, target: 2 }, [{ end: 2, start: 0 }], 1)];
  const updated = updatePotentialsPressure('substract')(pots, [{ end: 1, start: 0 }]);
  t.true(updated.length === 1);
  t.true(updated[0].pressure === 2);
});

test('will materialize atomic potentiality', t => {
  const toPlace = potentialFactory({ min: 1, target: 1 }, [{ end: 10, start: 0 }], 0.1);
  const pots = [
    potentialFactory({ min: 5, target: 5 }, [{ end: 5, start: 0 }], 1),
    potentialFactory({ min: 4, target: 4 }, [{ end: 10, start: 6 }], 1),
  ];
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, pots);
  const materials = materializePotentiality(toPlace, () => pots, pChunks)[0];
  t.true(materials.length === 1);
  t.true(materials[0].start === 5 && materials[0].end === 6);
});

test('will materialize without concurrent potentials', t => {
  const toPlace = potentialFactory({ min: 0, target: 1 }, [{ end: 10, start: 0 }], 0.5);
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, []);
  const materials = materializePotentiality(toPlace, () => [], pChunks)[0];
  t.true(materials.length === 1);
  t.true(materials[0].start === 0);
  t.true(materials[0].end === 1);
});

test('will materialize splittable potentiality', t => {
  const toPlace: IPotentiality = {
    ...potentialFactory({ min: 1, target: 9 }, [{ end: 10, start: 0 }], 0.6),
    isSplittable: true,
  };
  const pots = [potentialFactory({ min: 5, target: 5 }, [{ end: 8, start: 3 }], 1)];
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, pots);
  const materials = materializePotentiality(
    toPlace,
    updatePotentialsPressure('substract').bind(null, pots),
    pChunks
  )[0];
  t.true(materials.length === 2);
  t.true(materials[0].start === 0 && materials[0].end === 3);
  t.true(materials[1].start === 8 && materials[1].end === 10);
});

test('materialize will throw if no place available', t => {
  t.plan(2);
  const toPlace = potentialFactory({ min: 5, target: 10 }, [{ end: 10, start: 0 }], 0.6);
  const pChunks: IPressureChunk[] = [];
  t.throws(
    materializePotentiality.bind(
      null,
      toPlace,
      updatePotentialsPressure('substract').bind(null, []),
      pChunks
    ),
    'No chunks available'
  );
  const pChunks2 = computePressureChunks({ startDate: 42, endDate: 52 }, []);
  t.throws(
    materializePotentiality.bind(
      null,
      toPlace,
      updatePotentialsPressure('substract').bind(null, []),
      pChunks2
    ),
    'No chunks available'
  );
});

test('materialize will throw if not placable without conflict', t => {
  const toPlace = potentialFactory({ min: 5, target: 10 }, [{ end: 10, start: 0 }], 0.6);
  const pots = [
    potentialFactory({ min: 5, target: 5 }, [{ end: 5, start: 0 }], 0.5),
    potentialFactory({ min: 4, target: 4 }, [{ end: 10, start: 6 }], 0.65),
  ];
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, pots);
  t.throws(
    materializePotentiality.bind(
      null,
      toPlace,
      updatePotentialsPressure('substract').bind(null, pots),
      pChunks
    )
  );
});
