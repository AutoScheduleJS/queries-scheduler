import {
	converge,
	curry,
	has,
	identity,
	ifElse,
	maxBy,
	partial,
	pipe,
	prop,
	reduce,
	sortBy,
	unfold,
	unnest,
	without,
} from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IQuery, ITimeRestriction } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import { computePressureChunks } from './environment.flows';

type maskFn = (tm: IRange) => IRange[];
type mapRange = (r: IRange[], tm: IRange) => IRange[];

export const queriesToPipeline = (config: IConfig, queries: IQuery[]): IMaterial[] => {
	const potentials = queriesToPotentialities(config, queries);
	return sortBy(prop('start'), unfold(pipelineUnfolder, potentials));
};

const pipelineUnfolder = (potentials: IPotentiality[]): false | [IMaterial, IPotentiality[]] => {
	if (potentials.length < 1) {
		return false;
	}
	const toPlace = reduce(maxBy<IPotentiality>(prop('potentiel')), potentials[0], potentials);
	const newPotentials = without([toPlace], potentials);
	const material = materializePotentiality(computePressureChunks(toPlace, newPotentials));
	return [material, updatePotentialsPressure(material, newPotentials)];
};

const updatePotentialsPressure = (
	material: IMaterial,
	potentialities: IPotentiality[],
): IPotentiality[] => {
	return [];
};

const materializePotentiality = (pressure: IPressureChunk): IMaterial => {
	return null;
};

const queriesToPotentialities = (config: IConfig, queries: IQuery[]): IPotentiality[] => {
	return unnest(
		queries.map(
			converge(updateChildren, [
				ifElse(has('goal'), goalToPotentiality, atomicToPotentiality),
				queryToMask(config),
			]),
		),
	);
};

const queryToMask = curry((config: IConfig, query: IQuery): IRange[] => {
	const timeRestrictions = query.timeRestrictions || {};
	const maskPipeline = pipe(
		mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
		mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
		mapToTimeRestriction(timeRestrictions.hour, mapToHourRange),
	);
	return maskPipeline([{ start: config.startDate, end: config.endDate }]);
});

const mapToTimeRestriction = curry(
	(tr: ITimeRestriction | undefined, mapFn: mapRange, masks: IRange[]): IRange[] => {
		return tr == null ? masks : unnest(masks.map(getMaskFilterFn(tr, mapFn)));
	},
);

const mapToMonthRange = (ranges: IRange[], mask: IRange): IRange[] => {
	return [];
};
const mapToWeekdayRange = (ranges: IRange[], mask: IRange): IRange[] => {
	return [];
};
const mapToHourRange = (ranges: IRange[], mask: IRange): IRange[] => {
	return [];
};

const getMaskFilterFn = (tr: ITimeRestriction, mapFn: mapRange): maskFn => {
	return pipe(
		converge(maskRangeUnion, [
			partial(mapFn, tr.ranges.map(r => ({ start: r[0], end: r[1] }))),
			identity,
		]),
		// TODO: transform if condition === outrange
	);
};

const maskRangeUnion = (ranges: IRange[], mask: IRange): IRange[] => {
	return [];
};

const updateChildren = (potentials: IPotentiality[], mask: IRange[]): IPotentiality[] => {
	return [];
};

const goalToPotentiality = (query: IQuery): IPotentiality[] => {
	return [];
};

const atomicToPotentiality = (query: IQuery): IPotentiality[] => {
	return [];
};
