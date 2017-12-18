import {
  IGoalQuery,
  IProviderQuery,
  IQuery,
  isGoalQuery,
  isProviderQuery,
} from '@autoschedule/queries-fn';
import * as R from 'ramda';

import {
  computePressureChunks,
  materializePotentiality,
  updatePotentialsPressure,
} from '../data-flows/pipes.flow';
import {
  atomicToPotentiality,
  goalToPotentiality,
  mapToHourRange,
  mapToMonthRange,
  mapToTimeRestriction,
  mapToWeekdayRange,
} from '../data-flows/queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IRange } from '../data-structures/range.interface';

export function schedule(config: IConfig, queries: IQuery[]): IMaterial[] {
  const pipeline: IMaterial[] = queriesToPipeline(config, queries);

  return pipeline;
}

const sortByStart = R.sortBy<IMaterial>(R.prop('start'));
const getMax = <T>(prop: keyof T, list: T[]): T =>
  R.reduce(R.maxBy(R.prop(prop) as (n: any) => number), list[0], list);

const queriesToPipeline = (config: IConfig, queries: IQuery[]): IMaterial[] => {
  const dependencies = queries.map(queriesToDependencies);
  const potentials = queriesToPotentialities(config, dependencies);
  const result = sortByStart(
    R.unnest(R.unfold(R.partial(pipelineUnfolder, [config]), potentials))
  ) as IMaterial[];
  validateTimeline(result);
  return result;
};

const queriesToDependencies = (query: IQuery, _: number, queries: IQuery[]) => {
  if (isProviderQuery(query)) {
    const client = queries.find(q => q.id === query.provide);
    return { query, dependsOn: client ? [client.id] : [] };
  }
  return { query, dependsOn: [] };
};

const validateTimeline = (materials: IMaterial[]): void => {
  const last = R.last(materials);
  if (!last) {
    return;
  }
  if (last.end !== -1 || last.start !== -1) {
    return;
  }
  const error = new ConflictError(last.queryId);
  error.materials = R.init(materials);
  throw error;
};

const queriesToPotentialities = (
  config: IConfig,
  dependencies: Array<{ query: IQuery; dependsOn: number[] }>
): IPotentiality[] => {
  const result: IPotentiality[][] = [];
  const deps = [...dependencies];
  while (deps.length > 0) {
    const queryI = deps.findIndex(ds => ds.dependsOn.every(d => result.some(qs => qs[0].queryId === d)));
    if (queryI === -1) { break; }
    const query = deps[queryI];
    deps.splice(queryI, 1);
    result.push(queryToPotentialities(config)(query.query));
  }
  return R.unnest(result);
};

const queryToPotentiality = (config: IConfig) => (query: IQuery) => {
  if (isGoalQuery(query)) {
    return goalToPotentiality(config)(query);
  }
  return atomicToPotentiality(config)(query);
};

const pipelineUnfolder = (
  config: IConfig,
  potentials: IPotentiality[]
): false | [IMaterial[], IPotentiality[]] => {
  if (potentials.length < 1) {
    return false;
  }
  const toPlace = getMax('pressure', potentials);
  const newPotentials = R.without([toPlace], potentials);
  try {
    const result = materializePotentiality(
      toPlace,
      R.partial(updatePotentialsPressure('substract'), [newPotentials]),
      computePressureChunks(config, newPotentials)
    );
    return result;
  } catch (e) {
    return [[getErrorMaterial(toPlace)], []];
  }
};

const getErrorMaterial = (toPlace: IPotentiality): IMaterial => ({
  end: -1,
  materialId: toPlace.potentialId,
  queryId: toPlace.queryId,
  start: -1,
});

const queryToMask = R.curry((config: IConfig, query: IQuery): IRange[] => {
  if (isGoalQuery(query) || isProviderQuery(query)) {
    return timeRestToMask(config, query);
  }
  return [{ start: config.startDate, end: config.endDate }];
});

const queryToPotentialities = (config: IConfig) =>
  R.converge(updatePotentialsPressure('intersect'), [
    queryToPotentiality(config),
    queryToMask(config),
  ]);

const timeRestToMask = (config: IConfig, query: IGoalQuery | IProviderQuery): IRange[] => {
  const timeRestrictions = query.timeRestrictions || {};
  const maskPipeline = R.pipe(
    mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
    mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
    mapToTimeRestriction(timeRestrictions.hour, mapToHourRange)
  );
  return maskPipeline([{ start: config.startDate, end: config.endDate }]);
};
