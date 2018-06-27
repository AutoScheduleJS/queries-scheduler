import { IConfig } from '../data-structures/config.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IRange } from '../data-structures/range.interface';

export const asymptotTo = (limit: number) => (value: number) => (value / (value + 1)) * limit;

export const mean = (...list: number[]) => list.reduce((a, b) => a + b) / list.length;

export const fillLimitedArray = <T>(limit: number) => (arr: T[], value: T): T[] => {
  return arr.length < limit ? [...arr, value] : [...arr.slice(1), value];
};

export const areSameNumber = (minDiff: number) => (avg1: number, avg2: number): boolean => {
  return Object.is(avg1, avg2) || Math.abs(avg1 - avg2) < minDiff;
};

export const propOrDefault = <K>(
  defaultValue: K[keyof K],
  obj: K | undefined,
  propToCheck: Array<keyof K>
): K[keyof K] => {
  if (obj == null) {
    return defaultValue;
  }
  const resultProp = propToCheck.find(prop => obj[prop] != null);
  return resultProp ? obj[resultProp] : defaultValue;
};

export const maxBy = <T>(by: (a: T) => number) => (first: T, second: T): T => {
  return by(first) > by(second) ? first : second;
};

export const configToRange = (conf: IConfig): IRange => {
  return {
    end: conf.endDate,
    start: conf.startDate,
  };
};

export const getProp = <T>(prop: keyof T) => (obj: T): T[keyof T] => obj[prop];

export const getMax = <T>(prop: keyof T, list: ReadonlyArray<T>): T => {
  if (!list.length) {
    throw new Error('getMax of empty list');
  }
  if (typeof getProp(prop)(list[0]) !== 'number') {
    throw new Error(`${list[0]}.${prop} is not a number`);
  }
  return list.reduce(maxBy(getProp(prop) as (o: T) => any));
};

const sortBy = <T>(prop: keyof T, compare: (a: any, b: any) => number) => (
  list: ReadonlyArray<T>
): T[] => {
  return [...list].sort((a, b) => compare(a[prop], b[prop]));
};

const ascNumber = (a: number, b: number): number => a - b;

export const sortByStart = <T extends { start: number }>(list: ReadonlyArray<T>) =>
  sortBy<T>('start', ascNumber)(list);

export const getYfromStartEndLine = (
  seg: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  },
  x: number
): number => {
  const start = seg.start;
  const end = seg.end;
  const a = (end.y - start.y) / (end.x - start.x);
  const b = start.y - a * start.x;
  return a * x + b;
};

export const withinRange = (range: IRange) => (nb: number) => nb >= range.start && nb <= range.end;

export const chunkToSeg = (chunk: IPressureChunk) => ({
  end: {
    x: chunk.end,
    y: chunk.pressureEnd,
  },
  start: {
    x: chunk.start,
    y: chunk.pressureStart,
  },
});

export const rangeToIndexes = (range: IRange) => [range.start, range.end];

export const mapValue = <T, K>(mapFn: (a: T) => K) => (val: T) => mapFn(val);

export const defaultIfNaN = (defaultVal: number) =>
  mapValue<number, number>(x => (Number.isNaN(x) ? defaultVal : x));
