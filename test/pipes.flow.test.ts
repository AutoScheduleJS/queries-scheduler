import {
  IQueryPositionDurationInternal,
  ITimeBoundary,
  ITimeDurationInternal,
} from '@autoschedule/queries-fn';
import test, { TestContext } from 'ava';
import { isEqual } from 'intervals-fn';
import { BehaviorSubject, zip } from 'rxjs';
import { first, map } from 'rxjs/operators';
import {
  computePressure,
  computePressureChunks,
  materializePotentiality,
  placeToRange,
  updatePotentialsPressure,
} from '../src/data-flows/pipes.flow';
import { IConfig } from '../src/data-structures/config.interface';
import { IPotentiality } from '../src/data-structures/potentiality.interface';
import { IPressureChunk } from '../src/data-structures/pressure-chunk.interface';
import { IPotRange, IPotRangeKind, IRange } from '../src/data-structures/range.interface';

const potentialFactory = (
  dur: ITimeDurationInternal,
  places: IPotRange[][],
  pressure = 0,
  queryId = 42
): IPotentiality => {
  return {
    duration: { ...dur },
    isSplittable: false,
    places: [...places],
    potentialId: 1,
    pressure,
    queryId,
  };
};

const tupleToRange = (tuple: [number, number]) => ({ start: tuple[0], end: tuple[1] });

const placeFactoryRange = (range: [number, number], pressure?: number): IPotRange[] => {
  return [
    { end: range[1], start: range[0], kind: 'start', pressureStart: pressure || 1, pressureEnd: 0 },
    { end: range[1], start: range[0], kind: 'end', pressureStart: 0, pressureEnd: pressure || 1 },
  ];
};
interface ITimeBoundaryTest {
  max: number;
  min: number;
  target?: number;
}
const placeTipFn = (
  tb: ITimeBoundaryTest,
  kind: 'start' | 'end',
  pressure?: number
): IPotRange[] => {
  const press = pressure || 1;
  return tb.target
    ? [
        {
          end: tb.target,
          kind: `${kind}-before` as IPotRangeKind,
          pressureEnd: press,
          pressureStart: 0,
          start: tb.min,
        },
        {
          end: tb.max,
          kind: `${kind}-after` as IPotRangeKind,
          pressureEnd: -press,
          pressureStart: 0,
          start: tb.target,
        },
      ]
    : [
        {
          end: tb.max,
          kind: `${kind}` as IPotRangeKind,
          pressureEnd: kind === 'end' ? press : 0,
          pressureStart: kind === 'start' ? press : 0,
          start: tb.min,
        },
      ];
};

const tbFn = (config: IConfig) => (tb: ITimeBoundary): ITimeBoundaryTest => {
  return {
    max: tb.max ? tb.max : config.endDate,
    min: tb.min ? tb.min : config.startDate,
    target: tb.target,
  };
};

const placeFactoryTB = (start: ITimeBoundaryTest, end: ITimeBoundaryTest) => {
  return [...placeTipFn(start, 'start'), ...placeTipFn(end, 'end')];
};

const validatePressure = (t: TestContext, chunk: IPressureChunk, pressure: [number, number]) => {
  const message = `test chunk: ${chunk.start}-${chunk.end}`;
  t.is(chunk.pressureEnd, pressure[1], message);
  t.is(chunk.pressureStart, pressure[0], message);
};

const updatePotentialsPressureFromMats = (
  config: IConfig,
  position: IQueryPositionDurationInternal[],
  pots: IPotentiality[],
  masks: IRange[][]
) => (materials: any) =>
  pots.map((pot, i) => updatePotentialsPressure(config, position[i], pot, materials, masks[i]));

test('will correctly transforms IPotRange to IRange - simple', t => {
  const potRanges: IPotRange[] = [
    { start: 0, end: 10, kind: 'start', pressureEnd: 0, pressureStart: 0 },
    { start: 0, end: 10, kind: 'end', pressureEnd: 0, pressureStart: 0 },
  ];
  const range = placeToRange(potRanges);
  t.is(range.start, 0);
  t.is(range.end, 10);
});

test('will correctly transforms IPotRange to IRange - start - endTarget', t => {
  const potRanges: IPotRange[] = [
    { start: 2, end: 10, kind: 'start', pressureEnd: 0, pressureStart: 0 },
    { start: 0, end: 4, kind: 'end-before', pressureEnd: 0, pressureStart: 0 },
    { start: 4, end: 7, kind: 'end-after', pressureEnd: 0, pressureStart: 0 },
  ];
  const range = placeToRange(potRanges);
  t.is(range.start, 2);
  t.is(range.end, 7);
});

test('will compute pressure', t => {
  t.is(computePressure({ min: 1, target: 1 }, [tupleToRange([0, 1])]), 1);
  t.is(computePressure({ min: 0, target: 1 }, [tupleToRange([0, 1])]), 0.5);
  t.is(computePressure({ min: 0, target: 1 }, [tupleToRange([0, 2])]), 1 / 3);
  t.is(computePressure({ min: 1, target: 1 }, [tupleToRange([0, 2])]), 2 / 3);
  t.is(computePressure({ min: 1, target: 1 }, [tupleToRange([0, 1]), tupleToRange([1, 2])]), 2 / 3);
});

test('will compute pressure chunks when no potential', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunk = computePressureChunks(config, []);
  t.is(pChunk.length, 1);
  t.truthy(isEqual({ start: 0, end: 10 }, pChunk[0]));
  validatePressure(t, pChunk[0], [0, 0]);
});

test('will compute simple pressure chunks', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunks = computePressureChunks(config, [
    potentialFactory({ min: 1, target: 1 }, [placeFactoryRange([1, 2])], 1),
  ]);
  t.is(pChunks.length, 3);
  t.truthy(isEqual({ start: 0, end: 1 }, pChunks[0]));
  validatePressure(t, pChunks[0], [0, 0]);
  t.truthy(isEqual({ start: 1, end: 2 }, pChunks[1]));
  validatePressure(t, pChunks[1], [1, 1]);
  t.truthy(isEqual({ start: 2, end: 10 }, pChunks[2]));
  validatePressure(t, pChunks[2], [0, 0]);
});

test('will compute pressure chunks with start/end-before/after', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const myTbFn = tbFn(config);
  const pChunks = computePressureChunks(config, [
    potentialFactory(
      { min: 2, target: 4 },
      [placeFactoryTB(myTbFn({ target: 2 }), myTbFn({ target: 6 }))],
      1,
      1
    ),
  ]);
  t.is(pChunks.length, 3);
  t.truthy(isEqual({ start: 0, end: 2 }, pChunks[0]));
  validatePressure(t, pChunks[0], [0, 1]);
  t.truthy(isEqual({ start: 2, end: 6 }, pChunks[1]));
  validatePressure(t, pChunks[1], [1, 1]);
  t.truthy(isEqual({ start: 6, end: 10 }, pChunks[2]));
  validatePressure(t, pChunks[2], [1, 0]);
});

test('will simplify pressure chunks', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const pChunkA = computePressureChunks(config, [
    potentialFactory({ min: 0, target: 1 }, [placeFactoryRange([1, 2], 0.5)], 0.5, 1),
    potentialFactory({ min: 2, target: 2 }, [placeFactoryRange([1, 3], 1)], 1, 2),
  ]);
  t.is(pChunkA.length, 4);
  t.truthy(isEqual({ start: 0, end: 1 }, pChunkA[0]));
  validatePressure(t, pChunkA[0], [0, 0]);
  t.truthy(isEqual({ start: 1, end: 2 }, pChunkA[1]));
  validatePressure(t, pChunkA[1], [1.5, 1.5]);
  t.truthy(isEqual({ start: 2, end: 3 }, pChunkA[2]));
  validatePressure(t, pChunkA[2], [1, 1]);
  t.truthy(isEqual({ start: 3, end: 10 }, pChunkA[3]));
  validatePressure(t, pChunkA[3], [0, 0]);

  const pChunkB = computePressureChunks(config, [
    potentialFactory({ min: 5, target: 10 }, [placeFactoryRange([0, 10], 0.75)], 0.75, 3),
  ]);
  t.is(pChunkB.length, 1);
  t.truthy(isEqual({ start: 0, end: 10 }, pChunkB[0]));
  validatePressure(t, pChunkB[0], [0.75, 0.75]);
});

test('will update potentials pressure', t => {
  const duration = { min: 2, target: 2 };
  const pot = potentialFactory(duration, [placeFactoryRange([0, 2])], 1);
  const updated = updatePotentialsPressure(
    { startDate: 0, endDate: 2 },
    { duration },
    pot,
    [],
    [{ end: 1, start: 0 }]
  );
  t.is(updated.pressure, 2);
});

test('will materialize atomic potentiality', t => {
  const toPlace = potentialFactory({ min: 1, target: 1 }, [placeFactoryRange([0, 10])], 0.1, 1);
  const pots = [
    potentialFactory({ min: 5, target: 5 }, [placeFactoryRange([0, 5])], 1, 2),
    potentialFactory({ min: 4, target: 4 }, [placeFactoryRange([6, 10])], 1, 3),
  ];
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, pots);
  const materials = materializePotentiality(
    toPlace,
    () => pots,
    pChunks,
    new BehaviorSubject(null)
  );
  t.is(materials.length, 1);
  t.true(materials[0].start === 5 && materials[0].end === 6);
});

test('will materialize atomic within big chunk', t => {
  const toPlace = potentialFactory({ min: 1, target: 1 }, [placeFactoryRange([4, 7])], 1);
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, []);
  const materials = materializePotentiality(toPlace, () => [], pChunks, new BehaviorSubject(null));
  t.is(materials.length, 1);
  t.is(materials[0].start, 4);
  t.is(materials[0].end, 5);
});

test('will materialize without concurrent potentials', t => {
  const toPlace = potentialFactory({ min: 0, target: 1 }, [placeFactoryRange([0, 10])], 0.5);
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, []);
  const materials = materializePotentiality(toPlace, () => [], pChunks, new BehaviorSubject(null));
  t.is(materials.length, 1);
  t.is(materials[0].start, 0);
  t.is(materials[0].end, 1);
});

test('will materialize splittable potentiality', t => {
  const duration = { min: 1, target: 9 };
  const toPlace: IPotentiality = {
    ...potentialFactory(duration, [placeFactoryRange([0, 10])], 0.6, 42),
    isSplittable: true,
  };
  const pots = [potentialFactory({ min: 5, target: 5 }, [placeFactoryRange([3, 8])], 1, 66)];
  const config = { startDate: 0, endDate: 10 };
  const pChunks = computePressureChunks(config, pots);
  const materials = materializePotentiality(
    toPlace,
    updatePotentialsPressureFromMats(config, [{ duration: { min: 5, target: 5 } }], pots, [
      [{ end: 8, start: 3 }],
    ]),
    pChunks,
    new BehaviorSubject(null)
  );
  t.is(materials.length, 2);
  t.true(materials[0].start === 0 && materials[0].end === 3);
  t.true(materials[1].start === 8 && materials[1].end === 9);
});

test('materialize will throw if no place available', t => {
  t.plan(1);
  const duration = { min: 5, target: 10 };
  const toPlace = potentialFactory(duration, [placeFactoryRange([0, 10])], 0.6);

  const pChunks: IPressureChunk[] = [];
  const errors1 = new BehaviorSubject(null);
  const errors2 = new BehaviorSubject(null);

  materializePotentiality(toPlace, _ => [], pChunks, errors1);
  const pChunks2 = computePressureChunks({ startDate: 42, endDate: 52 }, []);
  materializePotentiality(toPlace, _ => [], pChunks2, errors2);
  return zip(errors1, errors2).pipe(
    map(_ => t.pass('should have errors')),
    first()
  );
});

test('materialize will throw if not placable without conflict', t => {
  const duration = { min: 5, target: 10 };
  const config = { startDate: 0, endDate: 10 };
  const toPlace = potentialFactory(duration, [placeFactoryRange([0, 10])], 0.6, 1);
  const dur1 = { min: 5, target: 5 };
  const dur2 = { min: 4, target: 4 };
  const pots = [
    potentialFactory(dur1, [placeFactoryRange([0, 5])], 1, 2),
    potentialFactory(dur2, [placeFactoryRange([6, 10])], 1, 3),
  ];
  const pChunks = computePressureChunks({ startDate: 0, endDate: 10 }, pots);
  const errors = new BehaviorSubject(null);
  materializePotentiality(
    toPlace,
    updatePotentialsPressureFromMats(config, [{ duration: dur1 }, { duration: dur2 }], pots, [
      [{ end: 5, start: 0 }],
      [{ end: 10, start: 6 }],
    ]),
    pChunks,
    errors
  );
  return errors.pipe(
    map(_ => t.pass('should have errors')),
    first()
  );
});
