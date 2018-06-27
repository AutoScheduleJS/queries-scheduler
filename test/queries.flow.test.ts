import * as Q from '@autoschedule/queries-fn';
import test, { TestContext } from 'ava';
import {
  atomicToPlaces,
  linkToMask,
  mapToHourRange,
  mapToMonthRange,
  mapToTimeRestriction,
  mapToWeekdayRange,
  queryToPotentiality,
} from '../src/data-flows/queries.flow';
import { configToRange } from '../src/data-flows/util.flow';
import { IConfig } from '../src/data-structures/config.interface';
import { IMaterial } from '../src/data-structures/material.interface';
import { IPotRange } from '../src/data-structures/range.interface';

const testPlaces = (t: TestContext, places: ReadonlyArray<IPotRange>, expected: IPotRange[]) => {
  t.true(places.length >= 2);
  places.forEach((place, i) => {
    t.is(place.kind, expected[i].kind, `for: ${i}`);
    t.is(place.end, expected[i].end, `for: ${i}`);
    t.is(place.start, expected[i].start, `for: ${i}`);
  });
};

const tinyToPotRange = (obj: {
  s: number;
  e: number;
  k: any;
  ps?: number;
  pe?: number;
}): IPotRange => {
  return {
    end: obj.e,
    kind: obj.k,
    pressureEnd: obj.pe || 0,
    pressureStart: obj.ps || 0,
    start: obj.s,
  };
};

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
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(Q.positionHelper(Q.start(5), Q.duration(1)));
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, confRange, atomic.position, 1)],
  };
  t.falsy(pots.isSplittable);
  testPlaces(
    t,
    pots.places[0],
    [
      { s: 0, e: 5, k: 'start-before' },
      { s: 5, e: 10, k: 'start-after' },
      { s: 0, e: 10, k: 'end' },
    ].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 1);
});

test('will convert atomic to potentiality (end, duration)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(Q.positionHelper(Q.end(6, 2, 8), Q.duration(1)));
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, confRange, atomic.position, 1)],
  };
  t.falsy(pots.isSplittable);
  testPlaces(
    t,
    pots.places[0],
    [
      { s: 0, e: 10, k: 'start' },
      { s: 2, e: 6, k: 'end-before' },
      { s: 6, e: 8, k: 'end-after' },
    ].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 1);
});

test('will convert atomic to potentiality (start, end)', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(Q.positionHelper(Q.start(5), Q.end(6)));
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, confRange, atomic.position, 1)],
  };

  t.false(pots.isSplittable);
  testPlaces(
    t,
    pots.places[0],
    [
      { s: 0, e: 5, k: 'start-before' },
      { s: 5, e: 10, k: 'start-after' },
      { s: 0, e: 6, k: 'end-before' },
      { s: 6, e: 10, k: 'end-after' },
    ].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 1);
  t.is(pots.duration.min, 1);
});

test('will convert atomic to pot (start, end) with actual range smaller than intrinsic range', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(Q.positionHelper(Q.start(3), Q.end(6, 6, 6)));
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, { end: 7, start: 4 }, atomic.position, 1)],
  };

  t.false(pots.isSplittable);
  t.true(pots.places[0].length === 3);
  testPlaces(
    t,
    pots.places[0],
    [
      { s: 4, e: 4, k: 'start-before' },
      { s: 4, e: 7, k: 'start-after' },
      { s: 6, e: 6, k: 'end' },
    ].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 3);
  t.is(pots.duration.min, 3);
});

test('will convert and handle min/max without target', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(
    Q.positionHelper(Q.start(undefined, 2, 6), Q.end(undefined, 4, 9), Q.duration(2, 1))
  );
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, confRange, atomic.position, 1)],
  };

  t.false(pots.isSplittable);
  testPlaces(
    t,
    pots.places[0],
    [{ s: 2, e: 6, k: 'start' }, { s: 4, e: 9, k: 'end' }].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 2);
  t.is(pots.duration.min, 1);
});

test('will convert with minimal start/end', t => {
  const config: IConfig = { startDate: 0, endDate: 10 };
  const confRange = configToRange(config);
  const atomic: Q.IQueryInternal = Q.queryFactory(
    Q.positionHelper(Q.start(undefined, undefined, 4), Q.end(undefined, 6, undefined))
  );
  const pots = {
    ...queryToPotentiality(atomic),
    places: [atomicToPlaces(confRange, confRange, atomic.position, 1)],
  };
  t.false(pots.isSplittable);
  testPlaces(
    t,
    pots.places[0],
    [{ s: 0, e: 4, k: 'start' }, { s: 6, e: 10, k: 'end' }].map(tinyToPotRange)
  );
  t.is(pots.duration.target, 2);
  t.is(pots.duration.min, 2);
});

test('will link to mask (one material) end', t => {
  const materials: ReadonlyArray<IMaterial> = [
    {
      end: 20,
      materialId: 1,
      queryId: 0,
      start: 10,
    },
    {
      end: 5,
      materialId: 0,
      queryId: 0,
      start: 0,
    },
  ];
  const config: IConfig = { startDate: 0, endDate: 30 };
  const queryLink: Q.IQueryLink = {
    distance: { max: 10, min: 5, target: 8 },
    origin: 'end',
    potentialId: 0,
    queryId: 0,
  };
  const query = Q.queryFactory(Q.positionHelper(Q.duration(10, 5)), Q.links([queryLink]));
  const result = linkToMask(materials, config)(query);
  t.is(result.length, 1);
  t.is(result[0].start, 10);
  t.is(result[0].end, 25);
});

test('will link to mask (one material) start', t => {
  const materials: ReadonlyArray<IMaterial> = [
    {
      end: 20,
      materialId: 0,
      queryId: 0,
      start: 15,
    },
  ];
  const config: IConfig = { startDate: 0, endDate: 30 };
  const queryLink: Q.IQueryLink = {
    distance: { max: -5, min: -10, target: -8 },
    origin: 'start',
    potentialId: 0,
    queryId: 0,
  };
  const query = Q.queryFactory(Q.positionHelper(Q.duration(4, 2)), Q.links([queryLink]));
  const result = linkToMask(materials, config)(query);
  t.is(result.length, 1);
  t.is(result[0].start, 5);
  t.is(result[0].end, 14);
});

test('will link to mask (potential with multiples places) end', t => {
  const materials: ReadonlyArray<IMaterial> = [
    {
      end: 5,
      materialId: 0,
      queryId: 0,
      start: 0,
    },
    {
      end: 40,
      materialId: 0,
      queryId: 0,
      start: 35,
    },
  ];
  const config: IConfig = { startDate: 0, endDate: 60 };
  const queryLink: Q.IQueryLink = {
    distance: { max: 10, min: 5, target: 8 },
    origin: 'end',
    potentialId: 0,
    queryId: 0,
  };
  const query = Q.queryFactory(Q.positionHelper(Q.duration(4, 2)), Q.links([queryLink]));
  const result = linkToMask(materials, config)(query);
  t.is(result.length, 2);
  t.is(result[0].end, 19);
  t.is(result[0].start, 10);
  t.is(result[1].end, 54);
  t.is(result[1].start, 45);
});

test('will link to mask (multiple links) end', t => {
  const materials: ReadonlyArray<IMaterial> = [
    {
      end: 20,
      materialId: 0,
      queryId: 0,
      start: 10,
    },
    {
      end: 30,
      materialId: 0,
      queryId: 1,
      start: 15,
    },
  ];
  const config: IConfig = { startDate: 0, endDate: 45 };
  const query = Q.queryFactory(
    Q.positionHelper(Q.duration(4, 2)),
    Q.links([
      {
        distance: { max: 10, min: 5, target: 8 },
        origin: 'end',
        potentialId: 0,
        queryId: 0,
      },
      {
        distance: { max: 5, min: 2, target: 3 },
        origin: 'end',
        potentialId: 0,
        queryId: 1,
      },
    ])
  );
  const result = linkToMask(materials, config)(query);
  t.is(result.length, 1);
  t.is(result[0].end, 34);
  t.is(result[0].start, 32);
});
