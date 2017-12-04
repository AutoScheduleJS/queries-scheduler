import { intersect, isDuring, isOverlapping, substract } from 'intervals-fn';
import * as R from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality, IPotentialitySimul } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IPressureChunkPoint, IPressurePoint } from '../data-structures/pressure-point.interface';
import { ITimeDuration } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

export const computePressure = (p: IPotentiality): number => {
  const space = R.sum(p.places.map(c => c.end - c.start));
  return (p.duration.min + p.duration.target) / space / 2;
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

export const updatePotentialsPressure = (
  potentialities: IPotentiality[],
  materials: IRange[]
): IPotentiality[] => {
  return potentialities.map(
    R.pipe(
      (p: IPotentiality) => ({ ...p, places: substract(p.places, materials) }),
      (p: IPotentiality) => ({ ...p, pressure: computePressure(p) })
    )
  );
};

export const materializePotentiality = (
  toPlace: IPotentiality,
  updatePP: (m: IMaterial[]) => IPotentiality[],
  pressure: IPressureChunk[]
): [IMaterial[], IPotentiality[]] => {
  const minMaterials = simulatePlacement(potToSimul('min', toPlace), pressure);
  const maxMaterials = simulatePlacement(potToSimul('target', toPlace), pressure);
  const minPots = updatePP(minMaterials);
  const maxPots = updatePP(maxMaterials);
  const minAvg = potentialsToMeanPressure(minPots);
  const maxAvg = potentialsToMeanPressure(maxPots);
  if (minAvg === maxAvg) {
    return [maxMaterials, maxPots];
  }
  const durationDiff = toPlace.duration.target - toPlace.duration.min;
  const idealDuration =
    toPlace.duration.min + getIntersectionPressure(durationDiff, [minAvg, maxAvg]);
  const materials = simulatePlacement(
    { isSplittable: toPlace.isSplittable, places: toPlace.places, duration: idealDuration },
    pressure
  );
  const updatedPotentials = updatePP(materials);
  throwIfInvalid(validatePotentials)(updatedPotentials);
  return [materials, updatedPotentials];
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

const computeContiguousPressureChunk = (
  duration: number,
  chunks: IPressureChunk[]
): IPressureChunk[] => {
  const firstTime = chunks[0].start;
  const lastTime = chunks[chunks.length - 1].end;
  return R.unnest(
    chunks.map(c => [
      { start: c.start, end: c.start + duration },
      { end: c.end, start: c.end - duration },
    ])
  )
    .filter(c => c.start >= firstTime && c.end <= lastTime)
    .map(c => {
      // [start, end] & chunks[] --> chunks cut to start end, conserving their data
      return intersect(c, chunks).reduce((acc, curr) => ({
        ...acc,
        pressure: getProportionalPressure(
          acc.end - acc.start,
          acc.pressure,
          curr.end - curr.start,
          curr.pressure
        ),
      }));
    });
};

const placeAtomic = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  const sortedChunks = sortByPressure(computeContiguousPressureChunk(toPlace.duration, pressure));
  if (sortedChunks.length === 0) {
    throw new Error('No chunks available');
  }
  const bestChunk = sortedChunks.find((chunk: IPressureChunk) => {
    return toPlace.places.some(isDuring(chunk));
  });
  if (!bestChunk) {
    throw new Error('No chunks available');
  }
  return [
    {
      end: bestChunk.end,
      id: Date.now(),
      start: bestChunk.start,
    },
  ];
};

const placeSplittable = (toPlace: IPotentialitySimul, pressure: IPressureChunk[]): IMaterial[] => {
  const sortedChunks = sortByPressure(pressure.filter(isOverlapping(toPlace.places)));
  let materializedSpace = 0;
  const result: IMaterial[] = [];
  while (materializedSpace < toPlace.duration && sortedChunks.length > 0) {
    const best = sortedChunks.pop() as IPressureChunk;
    const bestDur = best.end - best.start;
    if (bestDur > toPlace.duration) {
      best.end = best.start + toPlace.duration;
    }
    materializedSpace += bestDur;
    result.push({
      end: best.end,
      id: Date.now(),
      start: best.start,
    });
  }
  return result;
};

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
const throwIfInvalid = (validator: (d: any) => boolean) =>
  R.unless(validator, d => {
    throw new Error(`Invalid ${d}`);
  });

const getIntersectionPressure = (durDiff: number, [minAvg, maxAvg]: [number, number]): number => {
  const avgSeg = minAvg - maxAvg;
  return -minAvg * durDiff ** 2 / (-durDiff * (avgSeg + 1));
};

const potentialsToMeanPressure = R.pipe(
  (pots: IPotentiality[]) =>
    pots.map(R.pipe(R.pathOr(0, ['pressure']) as (n: IPotentiality) => number, R.max(1))), // Workaround for npm-ramda issue #311
  R.mean
);

const potToSimul = (durationType: keyof ITimeDuration, pot: IPotentiality): IPotentialitySimul => ({
  duration: pot.duration[durationType],
  isSplittable: pot.isSplittable,
  places: pot.places,
});
