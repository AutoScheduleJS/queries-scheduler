import {
	always,
	and,
	aperture,
	applySpec,
	converge,
	curry,
	divide,
	has,
	identity,
	ifElse,
	isNil,
	maxBy,
	partial,
	pathOr,
	pipe,
	prop,
	reduce,
	reject,
	sortBy,
	subtract,
	sum,
	times,
	unfold,
	unnest,
	without,
} from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { GoalKind, RestrictionCondition } from '../data-structures/query.enum';
import { IQuery, ITimeRestriction } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import { computePressureChunks } from './environment.flows';

type maskFn = (tm: IRange) => IRange[];
type mapRange = (r: IRange[], tm: IRange) => IRange[];
type toNumber = (o: any) => number;

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
				ifElse(has('goal'), goalToPotentiality(config), atomicToPotentiality(config)),
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

const ifHasStartEnd = ifElse(and(has('start'), has('end')));
const queryIsSplittable = (query: IQuery) =>
	query.goal ? query.goal.kind === GoalKind.Splittable : false;
const getTarget: (s: string) => toNumber = kind => pathOr(0, [kind, 'target']);
const qStart: toNumber = getTarget('start');
const qEnd: toNumber = getTarget('end');
const qDuration: toNumber = getTarget('duration');
const gQuantity: toNumber = pathOr(1, ['goal', 'quantity']);
const gtime: toNumber = pathOr(0, ['goal', 'time']);

const goalToDuration = ifElse(queryIsSplittable, gQuantity, qDuration);
const goalToTimeloop = ifElse(queryIsSplittable, gtime, converge(divide, [gtime, gQuantity]));

const goalToSubpipes = (config: IConfig, query: IQuery): IRange[] => {
	const start = config.startDate;
	const timeloop = goalToTimeloop(query);
	const maxDuration = config.endDate - config.startDate;
	const subpipeCount = Math.floor(maxDuration / timeloop);
	return times(
		i => ({ start: start + timeloop * i, end: start - 1 + timeloop * (i + 1) }),
		subpipeCount,
	);
};

const goalToPotentiality = curry((config: IConfig, query: IQuery): IPotentiality[] => {
	const duration = goalToDuration(query);
	const subpipes = goalToSubpipes(config, query);
	return subpipes.map((mask, i) => ({
		children: [mask],
		duration,
		name: `${query.name}-goal-${i}`,
		potentiel: -1,
	}));
});

const atomicToDuration = ifHasStartEnd(converge(subtract, [qEnd, qStart]), qDuration);
const atomicToChildren = (c: IConfig) =>
	ifHasStartEnd(
		applySpec<IRange>({ start: qStart, end: qEnd }),
		always<IRange>({ start: c.startDate, end: c.endDate }),
	);

const atomicToPotentiality = curry((config: IConfig, query: IQuery): IPotentiality[] => {
	const duration = atomicToDuration(query);
	const children = [atomicToChildren(config)(query)];
	const name = `${query.name}-atomic`;
	return [{ children, duration, name, potentiel: -1 }];
});
