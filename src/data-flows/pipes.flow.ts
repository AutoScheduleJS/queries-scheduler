import { ITimeDuration } from '@autoschedule/queries-fn';
import { intersect, isDuring, isOverlapping, substract } from 'intervals-fn';
import * as R from 'ramda';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import { IConfig } from '../data-structures/config.interface';
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';
import {
  IPotentiality,
  IPotentialityBase,
  IPotentialitySimul,
} from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IPressureChunkPoint, IPressurePoint } from '../data-structures/pressure-point.interface';
import { IRange } from '../data-structures/range.interface';

const computePressureWithSpace = (p: IPotentiality, space: number): number => {
  return (p.duration.min + p.duration.target) / space / 2;
};

export const computePressure = (p: IPotentiality): number => {
  const space = R.sum(p.places.map(c => c.end - c.start));
  return computePressureWithSpace(p, space);
};

const sortByTime = R.sortBy<IPressurePoint>(R.prop('time'));
const sortByPressure = R.sortBy<IPressureChunk>(R.prop('pressure'));

export const computePressureChunks = (
  config: IConfig,
  potentialities: IPotentiality[]
): IPressureChunk[] => {
  const [first, ...pressurePoints] = reducePressurePoints([
    { time: config.startDate, pressureDiff: 0 },
    ...potentialsToPressurePoint(potentialities),
    { time: config.endDate, pressureDiff: 0 },
  ]);
  const initChunk: IPressureChunk = {
    end: first.time,
    pressure: first.pressureDiff,
    start: config.startDate,
  };
  return R.unfold(R.partial(pressureChunkUnfolder, [pressurePoints]), [0, initChunk]);
};

const pressureChunkUnfolder = (
  pressurePoints: IPressurePoint[],
  [index, chunk]: [number, IPressureChunkPoint]
): false | [IPressureChunk, [number, IPressureChunkPoint]] => {
  if (index >= pressurePoints.length) {
    return false;
  }
  const pp = pressurePoints[index];
  const pressure = chunk.pressure + pp.pressureDiff;
  return [{ ...chunk, end: pp.time }, [index + 1, { start: pp.time, pressure }]];
};

const reducePressurePoints = R.pipe(
  R.reduceBy(
    (acc: IPressurePoint, cur: IPressurePoint) => ({
      pressureDiff: acc.pressureDiff + cur.pressureDiff,
      time: cur.time,
    }),
    { time: -1, pressureDiff: 0 },
    pp => '' + pp.time
  ),
  Object.values
) as (pp: IPressurePoint[]) => IPressurePoint[];

const potentialsToPressurePoint = (potentialities: IPotentiality[]): IPressurePoint[] => {
  return sortByTime(
    R.flatten<any>(
      potentialities.map(pot =>
        pot.places.map(pla => [
          { time: pla.start, pressureDiff: pot.pressure },
          { time: pla.end, pressureDiff: -pot.pressure },
        ])
      )
    )
  );
};

export const updatePotentialsPressureFromPots = (
  potentialities: IPotentiality[],
  ...masks: IRange[][]
): IPotentiality[] => {
  return potentialities.map(
    R.pipe(
      (p: IPotentiality) => ({
        ...p,
        places: masks.reduce((a, b) => intersect(a, b), p.places),
      }),
      (p: IPotentiality) => ({ ...p, pressure: computePressure(p) })
    )
  );
};

export const updatePotentialsPressureFromMats = (
  potentialities: ReadonlyArray<IPotentiality>,
  masks: ReadonlyArray<IMaterial>
): IPotentiality[] => {
  return potentialities.map(
    R.pipe(
      (p: IPotentiality) => ({
        ...p,
        places: substract(
          p.places,
          masks.filter(m => m.queryId !== p.queryId || m.materialId !== p.potentialId)
        ),
      }),
      (p: IPotentiality) => ({ ...p, pressure: computePressure(p) })
    )
  );
};

const fillLimitedArray = <T>(limit: number) => (arr: T[], value: T): T[] => {
  return arr.length < limit ? [...arr, value] : [...R.drop(1, arr), value];
};

const continueProgress = (progress: number[]): boolean => {
  return (
    (progress.length === 1 ||
      !R.reduceWhile(
        ({ similar, value }, cur) => similar,
        ({ similar, value }, cur) => ({ similar: similar && Object.is(value, cur), value: cur }),
        { similar: true, value: progress[0] },
        progress
      ).similar) &&
    (R.last(progress) as number) > 0.1
  );
};

const maxPlaceAvailable = (pot: IPotentiality) =>
  pot.places.map(place => place.end - place.start).reduce(R.max, 0);

const findMaxFinitePlacement = (
  toPlace: IPotentiality,
  updatePP: (m: IMaterial[]) => IPotentiality[],
  pressure: IPressureChunk[],
  error$: BehaviorSubject<any>
): [IMaterial[], IPotentiality[]] => {
  const minDur = toPlace.duration.min;
  const fillArray = fillLimitedArray<number>(3);
  const maxTest = maxPlaceAvailable(toPlace);
  const minTestDur = (dur: number) => Math.min(dur, maxTest);
  let lastProgress: number[] = [];
  let durationDelta = toPlace.duration.target - minDur;
  let testDuration = minTestDur(minDur + durationDelta / 2);
  let avgPre: number = 0;
  let myPre: number = 0;
  let materials: IMaterial[] = [];
  let pots: IPotentiality[] = [];
  do {
    materials = simulatePlacement({ ...toPlace, duration: testDuration }, pressure);
    pots = updatePP(materials);
    avgPre = potentialsToMeanPressure(pots);
    myPre = computePressureWithSpace(toPlace, testDuration);
    durationDelta /= 2;
    testDuration = minTestDur(
      avgPre > myPre ? testDuration - durationDelta : testDuration + durationDelta
    );
    lastProgress = fillArray(lastProgress, Math.abs(avgPre - myPre));
  } while (continueProgress(lastProgress));
  const err: [IMaterial[], IPotentiality[]] = [[], pots];
  if (!materials.length || !validatePotentials(pots)) {
    error$.next(new ConflictError(toPlace.queryId)); // Throw pots with pressure > 1
    return err;
  }
  return [materials, pots];
};

const areSameNumber = (minDiff: number) => (avg1: number, avg2: number): boolean => {
  return Object.is(avg1, avg2) || Math.abs(avg1 - avg2) < minDiff;
};

export const materializePotentiality = (
  toPlace: IPotentiality,
  updatePP: (m: IMaterial[]) => IPotentiality[],
  pressure: IPressureChunk[],
  error$: BehaviorSubject<any>
): [IMaterial[], IPotentiality[]] => {
  const minMaterials = simulatePlacement(potToSimul('min', toPlace), pressure);
  const maxMaterials = simulatePlacement(potToSimul('target', toPlace), pressure);
  if (!minMaterials.length && !maxMaterials.length) {
    error$.next(new ConflictError(toPlace.queryId));
    return [[], updatePP([])];
  }
  const minPots = updatePP(minMaterials);
  const maxPots = updatePP(maxMaterials);
  const minAvg = potentialsToMeanPressure(minPots);
  const maxAvg = potentialsToMeanPressure(maxPots);
  if (maxMaterials.length && areSameNumber(0.1)(minAvg, maxAvg)) {
    if (validatePotentials(minPots)) {
      return [maxMaterials, maxPots];
    }
    error$.next(new ConflictError(toPlace.queryId)); // use pots with > 1 pressure
    return [[], updatePP([])];
  }
  return findMaxFinitePlacement(toPlace, updatePP, pressure, error$);
};

const getProportionalPressure = (
  dur1: number,
  press1: number,
  dur2: number,
  press2: number
): number => {
  const total = dur1 + dur2;
  const newPress1 = press1 * dur1 / total;
  const newPress2 = press2 * dur2 / total;
  return (newPress1 + newPress2) / 2;
};
const rangeToDuration = (range: IRange): number => {
  return range.end - range.start;
};
const firstTimeRange = (ranges: IRange[]): number =>
  ranges.reduce((a, b) => (b.start < a ? b.start : a), Infinity);
const lastTimeRange = (ranges: IRange[]): number =>
  ranges.reduce((a, b) => (b.end > a ? b.end : a), -Infinity);
const scanPressure = (acc: IPressureChunk, curr: IPressureChunk): IPressureChunk => ({
  end: lastTimeRange([acc, curr]),
  pressure: getProportionalPressure(
    acc.end - acc.start,
    acc.pressure,
    curr.end - curr.start,
    curr.pressure
  ),
  start: firstTimeRange([acc, curr]),
});

const divideChunkByDuration = (duration: number) => (chunk: IPressureChunk): IRange[] => {
  return [
    { start: chunk.start, end: chunk.start + duration },
    { end: chunk.end, start: chunk.end - duration },
  ];
};

const rangeChunkIntersectin = (duration: number, chunks: IPressureChunk[]) => (range: IRange) => {
  const inter = intersect(range, chunks);
  if (!inter.length) {
    return null;
  }
  return inter.reduce(scanPressure);
};

const computeContiguousPressureChunk = (
  duration: number,
  chunks: IPressureChunk[]
): IPressureChunk[] => {
  if (!chunks.length) {
    return [];
  }
  return R.unnest(chunks.map(divideChunkByDuration(duration)))
    .filter(c => c.start >= firstTimeRange(chunks) && c.end <= lastTimeRange(chunks))
    .map(rangeChunkIntersectin(duration, chunks))
    .filter(p => p != null && p.end - p.start >= duration) as IPressureChunk[];
};

const findBestContiguousChunk = (
  toPlace: IPotentialitySimul,
  chunks: IPressureChunk[]
): IPressureChunk => {
  return sortByPressure(chunks).find(chunk =>
    toPlace.places.some(isDuring(chunk))
  ) as IPressureChunk;
};

const rangeToMaterial = (toPlace: IPotentialityBase, chunk: IRange): IMaterial => {
  return {
    end: chunk.end,
    materialId: toPlace.potentialId,
    queryId: toPlace.queryId,
    start: chunk.start,
  };
};

const minimizeChunkToDuration = (chunk: IPressureChunk, duration: number): IPressureChunk => ({
  ...chunk,
  end: Math.min(chunk.start + duration, chunk.end),
  start: chunk.start,
});

const placeAtomic = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  if (toPlace.places.length === 1 && rangeToDuration(toPlace.places[0]) === toPlace.duration) {
    const result = rangeChunkIntersectin(toPlace.duration, pressure)(toPlace.places[0]);
    if (result) {
      return [rangeToMaterial(toPlace, result)];
    }
  }
  const chunks = computeContiguousPressureChunk(toPlace.duration, pressure);
  if (chunks.length === 0) {
    return [];
  }
  const bestChunk = findBestContiguousChunk(toPlace, chunks);
  return [rangeToMaterial(toPlace, minimizeChunkToDuration(bestChunk, toPlace.duration))];
};

const placeSplittableUnfold = (
  toPlace: IPotentialitySimul,
  [materializedSpace, chunks]: [number, IPressureChunk[]]
): false | [IMaterial, [number, IPressureChunk[]]] => {
  if (materializedSpace >= toPlace.duration || !chunks.length) {
    return false;
  }
  const headChunk = R.head(chunks) as IPressureChunk;
  const newChunks = R.tail(chunks);
  const headDuration = rangeToDuration(headChunk);
  const remainingDuration = toPlace.duration - materializedSpace;
  return [
    rangeToMaterial(toPlace, minimizeChunkToDuration(headChunk, remainingDuration)),
    [Math.min(materializedSpace + headDuration, toPlace.duration), newChunks],
  ];
};

const placeSplittable = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  return R.unfold(R.partial(placeSplittableUnfold, [toPlace]), [0, pressure]).map(
    (material, i) => ({ ...material, splitId: i })
  );
};

const simulatePlacement = (
  toPlace: IPotentialitySimul,
  pressure: IPressureChunk[]
): IMaterial[] => {
  const sortedChunks = sortByPressure(
    intersect(toPlace.places, pressure.filter(isOverlapping(toPlace.places)))
  );
  if (!toPlace.isSplittable) {
    return placeAtomic(toPlace, sortedChunks);
  }
  return placeSplittable(toPlace, sortedChunks);
};

const validatePotentials = R.none(R.propSatisfies(p => p > 1, 'pressure'));

const potentialsToMeanPressure = R.pipe(
  (pots: IPotentiality[]) => pots.map(R.pathOr(0, ['pressure']) as (n: IPotentiality) => number), // Workaround for npm-ramda issue #311
  R.mean
);

const potToSimul = (durationType: keyof ITimeDuration, pot: IPotentiality): IPotentialitySimul => ({
  duration: pot.duration[durationType],
  isSplittable: pot.isSplittable,
  places: pot.places,
  potentialId: pot.potentialId,
  queryId: pot.queryId,
});
