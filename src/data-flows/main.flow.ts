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
  updateChildren,
} from '../data-flows/queries.flow';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IQuery } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

export function schedule(config: IConfig, queries: IQuery[]): Promise<IMaterial[]> {
  const pipeline: IMaterial[] = queriesToPipeline(config, queries);

  return Promise.resolve(pipeline);
}

const sortByStart = R.sortBy<IMaterial>(R.prop('start'));
const getMax = <T>(prop: keyof T, list: T[]): T =>
  R.reduce(R.maxBy(R.prop(prop) as (n: any) => number), list[0], list);

const queriesToPipeline = (config: IConfig, queries: IQuery[]): IMaterial[] => {
  const potentials = queriesToPotentialities(config, queries);
  return sortByStart(
    R.unnest(R.unfold(R.partial(pipelineUnfolder, [config]), potentials))
  ) as IMaterial[];
};

const queriesToPotentialities = (config: IConfig, queries: IQuery[]): IPotentiality[] => {
  return R.unnest(
    queries.map(
      R.converge(updateChildren, [
        R.ifElse(R.has('goal'), goalToPotentiality(config), atomicToPotentiality(config)),
        queryToMask(config),
      ])
    )
  );
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
  return materializePotentiality(
    toPlace,
    R.partial(updatePotentialsPressure, [newPotentials]),
    computePressureChunks(config, newPotentials)
  );
};

const queryToMask = R.curry((config: IConfig, query: IQuery): IRange[] => {
  const timeRestrictions = query.timeRestrictions || {};
  const maskPipeline = R.pipe(
    mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
    mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
    mapToTimeRestriction(timeRestrictions.hour, mapToHourRange)
  );
  return maskPipeline([{ start: config.startDate, end: config.endDate }]);
});
