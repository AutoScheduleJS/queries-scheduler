import {
	always,
	and,
	aperture,
	applySpec,
	converge,
	curry,
	has,
	identity,
	ifElse,
	isNil,
	maxBy,
	partial,
	path,
	pipe,
	prop,
	reduce,
	reject,
	sortBy,
	sum,
	unapply,
	unfold,
	unnest,
	without,
} from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { RestrictionCondition } from '../data-structures/query.enum';
import { IQuery, ITimeRestriction } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import { computePressureChunks } from './environment.flows';

type maskFn = (tm: IRange) => IRange[];
type mapRange = (r: IRange[], tm: IRange) => IRange[];
type queryToPot = (q: IQuery) => IPotentiality[];

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
				ifElse(has('goal'), goalToPotentiality, atomicToPotentiality(config)),
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
	return converge(
		(ranges: IRange[], mask: IRange) =>
			tr.condition === RestrictionCondition.InRange ? ranges : outboundToInboud(ranges, mask),
		[
			converge(maskRangeUnion, [
				partial(mapFn, tr.ranges.map(r => ({ start: r[0], end: r[1] }))),
				identity,
			]),
			identity,
		],
	);
};

const outboundToInboud = (ranges: IRange[], mask: IRange): IRange[] => {
	const prepRanges: IRange[] = [
		{ start: -Infinity, end: mask.start },
		...ranges,
		{ start: mask.end, end: Infinity },
	];
	return reject<IRange | null>(
		isNil,
		aperture(2, prepRanges).map(
			([r1, r2]) => (r1.end >= r2.start ? null : { start: r1.end, end: r2.start }),
		),
	) as IRange[];
};

const maskRangeUnion = (ranges: IRange[], mask: IRange): IRange[] => {
	return ranges
		.filter(r => r.start < mask.end && r.end > mask.start)
		.sort((a, b) => a.start - b.start)
		.map(range => ({
			end: Math.min(mask.end, range.end),
			start: Math.max(mask.start, range.start),
		}));
};

const updateChildren = (potentials: IPotentiality[], mask: IRange[]): IPotentiality[] => {
	return potentials.map(
		pipe(
			p => ({ ...p, children: maskRangeUnion(mask, p.children[0]) }),
			p => ({ ...p, potentiel: p.duration / sum(p.children.map(c => c.end - c.start)) }),
		),
	);
};

const goalToPotentiality = (query: IQuery): IPotentiality[] => {
	return [];
};

const atomicToPotentiality = (config: IConfig) => {
	const t = converge(
		unapply(
			applySpec<IPotentiality>({
				children: path(['0', '1']),
				duration: path(['0', '0']),
				name: path(['1']),
				potentiel: always(-1),
			}),
		),
		[
			ifElse(and(has('start'), has('end')), always([0, []]), always([0, []])),
			(q: IQuery) => `${q.name}-atomic`,
		],
	);
	return t;
};
