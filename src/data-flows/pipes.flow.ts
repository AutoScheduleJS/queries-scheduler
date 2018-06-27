import { IQueryPositionDurationInternal, ITimeDurationInternal } from '@autoschedule/queries-fn';
import { intersect, split, substract } from 'intervals-fn';
import * as R from 'ramda';
import { BehaviorSubject } from 'rxjs';
import { IConfig } from '../data-structures/config.interface';
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';
import {
  IPotentiality,
  IPotentialityBase,
  IPotentialitySimul,
} from '../data-structures/potentiality.interface';
import { IAreaPressureChunk, IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IPotRange, IPotRangeKind, IRange } from '../data-structures/range.interface';
import { atomicToPlaces } from './queries.flow';
import {
  areSameNumber,
  asymptotTo,
  chunkToSeg,
  configToRange,
  fillLimitedArray,
  getYfromStartEndLine,
  mean,
  sortByStart,
  withinRange,
} from './util.flow';

const computePressureWithSpace = (duration: ITimeDurationInternal, space: number): number => {
  const min = duration.min / space;
  if (min >= 1) {
    return min;
  }
  return min + asymptotTo(1 - min)(duration.target / space);
};

const filterPlaceForPressure = (place: IPotRange) =>
  ['start', 'end', 'start-before', 'end-after'].includes(place.kind);

const filterPlaceForStart = (place: IPotRange) =>
  ['start', 'start-before', 'start-after'].includes(place.kind);

const filterPlaceForEnd = (place: IPotRange) =>
  ['end', 'end-before', 'end-after'].includes(place.kind);

export const placeToRange = (place: ReadonlyArray<IPotRange>): IRange => {
  const points = place
    .filter(filterPlaceForPressure)
    .map(c => {
      if (c.kind.startsWith('start')) {
        return c.start;
      }
      return c.end;
    })
    .sort((a, b) => a - b);
  return {
    end: points[1],
    start: points[0],
  };
};

const placeToMaxDuration = (place: ReadonlyArray<IPotRange>): number => {
  const range = placeToRange(place);
  return range.end - range.start;
};

/**
 * How to compute pressure ? start/end/target or only target
 */
export const computePressure = (
  duration: ITimeDurationInternal,
  places: ReadonlyArray<IRange>
): number => {
  const space = R.sum(places.map(r => r.end - r.start));
  return computePressureWithSpace(duration, space);
};

/**
 *    A   B   C    D   E
 *          ______
 * |_____|/|      |\|_____|
 * push:         \
 *                     \
 * impact 3 pressureChunk: C, D, E
 * with sortByStart, should only impact C.
 * startMin & endMax should be normalized: { startPressure: 0, endPressure: diff }
 *   A      B
 * |   |       /|
 * |___|/       |
 * push:
 *         \
 *                   \
 * impact 1 pressureChunk: B
 * result in: (max 3 chunks, min 1 chunk)
 * 1   2   3    4      5
 * |   |   |____|      |
 * |___|/  |    |\     |
 * |   |   |    |     \|
 * need to compute pressure at 3, 4, 5
 * 3 & 4: compute press at specific point for pushed IRange & add pressure from terminal point.
 *
 * Instead of merging intersection, we have to merge when two intervals are overlapping
 */
export const computePressureChunks = (
  config: IConfig,
  potentialities: IPotentiality[]
): IPressureChunk[] => {
  const results = sortByStart(
    R.unnest(potentialities.map(pot => R.unnest(pot.places).filter(filterPlaceForPressure)))
  );
  return results.reduce(reducePlaceToPressureChunk, [
    {
      ...configToRange(config),
      pressureEnd: 0,
      pressureStart: 0,
    },
  ]);
};

/**
 *           ___
 * push:    |   |
 *
 * push:      /
 *
 *          | |||
 *             _
 *           _/ |
 * result:  |
 *     ___
 *    |   |
 * p:        /
 *     ___
 * r: |   |  /
 */
const reducePlaceToPressureChunk = (
  acc: IPressureChunk[],
  cur: IPressureChunk
): IPressureChunk[] => {
  const splittedChunks = split([cur.start, cur.end], acc);
  const diff = cur.pressureEnd - cur.pressureStart;
  const seg = chunkToSeg(cur);
  return splittedChunks.map(chunk => {
    if (chunk.start < cur.start) {
      return chunk;
    }
    if (chunk.start >= cur.end) {
      return {
        ...chunk,
        pressureEnd: chunk.pressureEnd + diff,
        pressureStart: chunk.pressureStart + diff,
      };
    }
    return {
      ...chunk,
      pressureEnd: getYfromStartEndLine(seg, chunk.end) + chunk.pressureEnd,
      pressureStart: getYfromStartEndLine(seg, chunk.start) + chunk.pressureStart,
    };
  });
};

export const updatePotentialsPressure = (
  config: IConfig,
  position: IQueryPositionDurationInternal,
  potentiality: IPotentiality,
  materials: ReadonlyArray<IMaterial>,
  ...masks: IRange[][]
): IPotentiality => {
  const boundaries = substract(
    masks.reduce((a, b) => intersect(b, a), [configToRange(config)]),
    sortByStart(materials)
  );
  const intrinsicPlace = {
    end: position.end && position.end.max ? position.end.max : config.endDate,
    start: position.start && position.start.min ? position.start.min : config.startDate,
  };
  const simplePlaces: IRange[] = intersect([intrinsicPlace], boundaries);
  const pressure = computePressure(potentiality.duration, simplePlaces);
  const places = boundaries.map(bounds =>
    atomicToPlaces(configToRange(config), bounds, position, pressure)
  );
  return {
    ...potentiality,
    places,
    pressure,
  };
};

const isProgressing = (progress: number[]): boolean => {
  return (
    (progress.length === 1 ||
      !R.reduceWhile(
        ({ similar }, _) => similar,
        ({ similar, value }, cur) => ({
          similar: similar && Math.abs(value - cur) < 0.05,
          value: cur,
        }),
        { similar: true, value: progress[0] },
        progress
      ).similar) &&
    (R.last(progress) as number) > 0.1
  );
};

const maxPlaceAvailable = (pot: IPotentiality) =>
  pot.places.map(placeToMaxDuration).reduce(R.max, 0);

const stopSearchFn = () => {
  let lastProgress: boolean[] = [];
  const fillProgress = fillLimitedArray<boolean>(3);
  return (progress: boolean, avgPressure: number) => {
    lastProgress = fillProgress(lastProgress, progress);
    if (!progress && avgPressure <= 1) {
      return true;
    }
    return avgPressure > 1 && lastProgress.every(p => !p);
  };
};

const findMaxFinitePlacement = (
  toPlace: IPotentiality,
  updatePP: (m: IMaterial[]) => IPotentiality[],
  pressure: IPressureChunk[],
  error$: BehaviorSubject<any>
): IMaterial[] => {
  const minDur = toPlace.duration.min;
  const fillArray = fillLimitedArray<number>(3);
  const maxTest = maxPlaceAvailable(toPlace);
  const minTestDur = (dur: number) => Math.min(Math.floor(dur), maxTest);
  const stopSearch = stopSearchFn();
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
    myPre = computePressureWithSpace(
      { min: minDur, target: testDuration },
      maxPlaceAvailable(toPlace)
    );
    durationDelta /= 1.8;
    let factor = avgPre > myPre ? 1 : -1;
    if (avgPre > 1) {
      factor *= -1;
    }
    testDuration = minTestDur(testDuration + factor * durationDelta);
    lastProgress = fillArray(lastProgress, Math.abs(avgPre - myPre));
  } while (!stopSearch(isProgressing(lastProgress), avgPre));
  const err: IMaterial[] = [];
  if (!materials.length || !validatePotentials(pots)) {
    error$.next(new ConflictError(toPlace.queryId)); // Throw pots with pressure > 1
    return err;
  }
  return materials;
};

export const materializePotentiality = (
  toPlace: IPotentiality,
  updatePP: (m: IMaterial[]) => IPotentiality[],
  pressure: IPressureChunk[],
  error$: BehaviorSubject<any>
): IMaterial[] => {
  const minMaterials = simulatePlacement(potToSimul('min', toPlace), pressure);
  const maxMaterials = simulatePlacement(potToSimul('target', toPlace), pressure);
  if (!minMaterials.length && !maxMaterials.length) {
    error$.next(new ConflictError(toPlace.queryId));
    return [];
  }
  const minPots = updatePP(minMaterials);
  const maxPots = updatePP(maxMaterials);
  const minAvg = potentialsToMeanPressure(minPots);
  const maxAvg = potentialsToMeanPressure(maxPots);
  if (maxMaterials.length && areSameNumber(0.1)(minAvg, maxAvg)) {
    if (validatePotentials(minPots)) {
      return maxMaterials;
    }
    error$.next(new ConflictError(toPlace.queryId)); // use pots with > 1 pressure
    return [];
  }
  return findMaxFinitePlacement(toPlace, updatePP, pressure, error$);
};

export const computePressureArea = (pressureChunk: IPressureChunk): number => {
  const A = { y: pressureChunk.pressureStart, x: pressureChunk.start };
  const B = { y: pressureChunk.pressureEnd, x: pressureChunk.end };
  const C = { x: pressureChunk.end };
  const D = { x: pressureChunk.start };
  return Math.abs(A.x * B.y - A.y * B.x - B.y * C.x + D.x * A.y);
};

const rangeToDuration = (range: IRange): number => {
  return range.end - range.start;
};
const firstTimeRange = (ranges: IRange[]): number =>
  ranges.reduce((a, b) => (b.start < a ? b.start : a), Infinity);
const lastTimeRange = (ranges: IRange[]): number =>
  ranges.reduce((a, b) => (b.end > a ? b.end : a), -Infinity);
const scanPressure = (acc: number, curr: IAreaPressureChunk) => acc + curr.areaPressure;

const divideChunkByDuration = (duration: number) => (chunk: IPressureChunk): IRange[] => {
  return [
    { start: chunk.start, end: chunk.start + duration },
    { end: chunk.end, start: chunk.end - duration },
  ];
};

const pressureChunkToAreaPressure = (chunk: IPressureChunk): IAreaPressureChunk => ({
  areaPressure: computePressureArea(chunk),
  end: chunk.end,
  start: chunk.start,
});

const rangeChunkIntersectin = (chunks: IPressureChunk[]) => (
  range: IRange
): IAreaPressureChunk | null => {
  const inter = intersect([range], chunks);
  if (!inter.length) {
    return null;
  }
  // add all area surface
  const areaPressure = inter.map(pressureChunkToAreaPressure).reduce(scanPressure, 0);
  return {
    areaPressure,
    end: lastTimeRange(inter),
    start: firstTimeRange(inter),
  };
};

const computePressureFactorFn = (potRange: IPotRange, maxPressure: number) => (x: number) => {
  const seg = potRangeToSeg(potRange, maxPressure);
  if (!withinRange(potRange)(x)) {
    return 0;
  }
  if (seg.start.x === seg.end.x) {
    return maxPressure;
  }
  return Math.min(0, Math.max(-maxPressure, getYfromStartEndLine(seg, x) * -1));
};

const potRangeKindIs = (kind: 'start' | 'end') => (potRange: IPotRange): boolean =>
  potRange.kind.startsWith(kind);

const adjustAreaPressure = (pot: IPotentialitySimul, places: ReadonlyArray<IPotRange>) => (
  chunk: IAreaPressureChunk
): IPressureChunk => {
  return places.reduce((acc, cur) => {
    const computePressureFactor = computePressureFactorFn(cur, pot.pressure);
    const endFactor = potRangeKindIs('end')(cur) ? computePressureFactor(acc.end) : 0;
    const startFactor = potRangeKindIs('start')(cur) ? computePressureFactor(acc.start) : 0;
    // console.log(
    //   `For: ${cur.kind}, with acc: ${acc.start}-${
    //     acc.end
    //   }: S:${startFactor};E:${endFactor}; queryId: ${pot.queryId}, dur: ${pot.duration}`
    // );
    return {
      ...acc,
      pressureEnd: acc.pressureEnd + endFactor,
      pressureStart: acc.pressureStart + startFactor,
    };
  }, areaToPressureChunk(chunk));
};

/**
 * Define fav points that will lower pressure
 */
const potRangeToSeg = (potRange: IPotRange, maxPressure: number) => {
  const endZeroKinds: IPotRangeKind[] = ['end-before', 'start-before'];
  const startZeroKinds: IPotRangeKind[] = ['start-after', 'end-after'];
  const k = potRange.kind;
  return {
    end: { x: potRange.end, y: endZeroKinds.includes(k) ? maxPressure : 0 },
    start: { x: potRange.start, y: startZeroKinds.includes(k) ? maxPressure : 0 },
  };
};

const areaToPressureChunk = (areaChunk: IAreaPressureChunk): IPressureChunk => ({
  end: areaChunk.end,
  pressureEnd: areaChunk.areaPressure,
  pressureStart: areaChunk.areaPressure,
  start: areaChunk.start,
});

const computeContiguousPressureChunk = (
  potential: IPotentialitySimul,
  chunks: IPressureChunk[]
): IPressureChunk | null => {
  if (!chunks.length) {
    return null;
  }
  const areaPressures = potential.places
    .map(place => {
      const [startRange, endRange] = placeToStartEndRanges(place);
      const dividedChunks: IPressureChunk[] = R.ifElse(
        R.isEmpty,
        () => intersect([{ start: startRange.start, end: endRange.end }], chunks),
        R.identity
      )(intersect(placeToTinniest(place), chunks));
      const allResultChunks = R.unnest(dividedChunks.map(divideChunkByDuration(potential.duration)))
        .filter(c => withinRange(startRange)(c.start) && withinRange(endRange)(c.end))
        .map(rangeChunkIntersectin(chunks))
        .filter(c => c != null && c.end - c.start >= potential.duration)
        .map(chunk => adjustAreaPressure(potential, place)(chunk as IAreaPressureChunk));
      if (allResultChunks.length < 2) {
        return allResultChunks[0];
      }
      return reduceChunksToMin(allResultChunks);
    })
    .filter(p => p != null);
  if (areaPressures.length < 2) {
    return areaPressures[0];
  }
  return reduceChunksToMin(areaPressures);
};

const reduceChunksToMin = (chunks: IPressureChunk[]): IPressureChunk => {
  return chunks.reduce(
    (acc, curr) => (chunkToMeanPressure(acc) <= chunkToMeanPressure(curr) ? acc : curr)
  );
};

const chunkToMeanPressure = (chunk: IPressureChunk) => mean(chunk.pressureStart, chunk.pressureEnd);

const placeToTinniest = (places: ReadonlyArray<IPotRange>): IRange[] => {
  const starts = places.filter(filterPlaceForStart);
  const ends = places.filter(filterPlaceForEnd);
  const start = reducePlaceToRange('start')(starts);
  const end = reducePlaceToRange('end')(ends);
  return rangeToDuration(start) <= rangeToDuration(end) ? starts : ends;
};

const placeToStartEndRanges = (places: ReadonlyArray<IPotRange>): [IRange, IRange] => {
  return [
    reducePlaceToRange('start')(places.filter(filterPlaceForStart)),
    reducePlaceToRange('end')(places.filter(filterPlaceForEnd)),
  ];
};

const reducePlaceToRange = (kind: 'start' | 'end') => (places: ReadonlyArray<IPotRange>) =>
  places.reduce(
    (acc, cur) => ({
      end: cur.kind === kind || cur.kind.endsWith('after') ? cur.end : acc.end,
      start: cur.kind === kind || cur.kind.endsWith('before') ? cur.start : acc.start,
    }),
    { start: -Infinity, end: Infinity }
  );

const rangeToMaterial = (toPlace: IPotentialityBase, chunk: IRange): IMaterial => {
  return {
    end: chunk.end,
    materialId: toPlace.potentialId,
    queryId: toPlace.queryId,
    start: chunk.start,
  };
};

/**
 * TODO: update areaPressure
 */
const minimizeChunkToDuration = (chunk: IPressureChunk, duration: number): IRange => {
  return chunk.pressureEnd >= chunk.pressureStart
    ? {
        end: Math.min(chunk.start + duration, chunk.end),
        start: chunk.start,
      }
    : {
        end: chunk.end,
        start: Math.max(chunk.end - duration, chunk.start),
      };
};

const placeAtomic = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  const bestChunk = computeContiguousPressureChunk(toPlace, pressure);
  if (bestChunk == null) {
    return [];
  }
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
const sortByPressure = (chunks: ReadonlyArray<IPressureChunk>) =>
  [...chunks].sort((a, b) => computePressureArea(a) - computePressureArea(b));

const placeSplittable = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  const sortedPressure = sortByPressure(
    toPlace.places
      .map(place => intersect([placeToRange(place)], pressure))
      .reduce((acc, cur) => [...acc, ...cur], [])
  );
  return R.unfold(R.partial(placeSplittableUnfold, [toPlace]), [0, sortedPressure]).map(
    (material, i) => ({ ...material, splitId: i })
  );
};

/**
 * TODO: Only use target places
 */
const simulatePlacement = (
  toPlace: IPotentialitySimul,
  pressure: IPressureChunk[]
): IMaterial[] => {
  if (!toPlace.isSplittable) {
    return placeAtomic(toPlace, pressure);
  }
  return placeSplittable(toPlace, pressure);
};

const validatePotentials = R.none(R.propSatisfies(p => p > 1, 'pressure'));

const potentialsToMeanPressure = R.pipe(
  (pots: IPotentiality[]) => pots.map(R.pathOr(0, ['pressure']) as (n: IPotentiality) => number), // Workaround for npm-ramda issue #311
  R.mean
);

const potToSimul = (
  durationType: keyof ITimeDurationInternal,
  pot: IPotentiality
): IPotentialitySimul => ({
  duration: pot.duration[durationType],
  isSplittable: pot.isSplittable,
  places: pot.places,
  potentialId: pot.potentialId,
  pressure: pot.pressure,
  queryId: pot.queryId,
});
