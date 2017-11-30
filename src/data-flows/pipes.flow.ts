import { complement, intersect, isDuring, isOverlapping, substract } from 'intervals-fn';
import * as moment from 'moment';
import * as R from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality, IPotentialitySimul } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IPressureChunkPoint, IPressurePoint } from '../data-structures/pressure-point.interface';
import { GoalKind, RestrictionCondition } from '../data-structures/query.enum';
import { IQuery, ITimeDuration, ITimeRestriction } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

type maskFn = (tm: IRange) => IRange[];
type mapRange = (r: IRange[], tm: IRange) => IRange[];
type toNumber = (o: any) => number;
type getFirstFn = (rest: IRange) => IRange;
type unfoldRange = (seed: IRange) => false | [IRange, IRange];
type toTimeDur = (o: any) => ITimeDuration;

export const queriesToPipeline = (config: IConfig, queries: IQuery[]): IMaterial[] => {
	const potentials = queriesToPotentialities(config, queries);
	return sortByStart(
		R.unnest(R.unfold(R.partial(pipelineUnfolder, [config]), potentials)),
	) as IMaterial[];
};

const sortByTime = R.sortBy<IPressurePoint>(R.prop('time'));
const sortByStart = R.sortBy<IMaterial | IRange>(R.prop('start'));
const sortByPressure = R.sortBy<IPressureChunk>(R.prop('pressure'));
const getMax = <T>(prop: keyof T, list: T[]): T =>
	R.reduce(R.maxBy(R.prop(prop) as (n: any) => number), list[0], list);

const pipelineUnfolder = (
	config: IConfig,
	potentials: IPotentiality[],
): false | [IMaterial[], IPotentiality[]] => {
	if (potentials.length < 1) {
		return false;
	}
	const toPlace = getMax('pressure', potentials);
	const newPotentials = R.without([toPlace], potentials);
	return materializePotentiality(
		toPlace,
		R.partial(updatePotentialsPressure, [newPotentials]),
		computePressureChunks(config, newPotentials),
	);
};

const computePressureChunks = (
	config: IConfig,
	potentialities: IPotentiality[],
): IPressureChunk[] => {
	const pressurePoints = potentialsToPressurePoint(potentialities);
	const initChunk: IPressureChunk = { start: config.startDate, end: config.endDate, pressure: 0 };
	return R.unfold(R.partial(pressureChunkUnfolder, [pressurePoints]), [0, initChunk]);
};

const pressureChunkUnfolder = (
	pressurePoints: IPressurePoint[],
	[index, chunk]: [number, IPressureChunkPoint],
): false | [IPressureChunk, [number, IPressureChunkPoint]] => {
	if (index >= pressurePoints.length) {
		return false;
	}
	const pp = pressurePoints[index];
	const pressure = chunk.pressure + pp.pressureDiff;
	return [{ ...chunk, end: pp.time }, [index + 1, { start: pp.time, pressure }]];
};

const potentialsToPressurePoint = (potentialities: IPotentiality[]): IPressurePoint[] => {
	const rawPP = R.flatten<any>(
		potentialities.map(pot =>
			pot.places.map(pla => [
				{ time: pla.start, pressureDiff: pot.pressure },
				{ time: pla.end, pressureDiff: -pot.pressure },
			]),
		),
	);
	return sortByTime(Object.values(
		R.reduceBy(
			(acc: IPressurePoint, cur: IPressurePoint) => ({
				pressureDiff: acc.pressureDiff + cur.pressureDiff,
				time: cur.time,
			}),
			{ time: 0, pressureDiff: 0 },
			pp => '' + pp.time,
			rawPP,
		),
	) as IPressurePoint[]);
};

const updatePotentialsPressure = (
	potentialities: IPotentiality[],
	materials: IMaterial[],
): IPotentiality[] => {
	return potentialities.map(
		R.pipe(
			(p: IPotentiality) => ({ ...p, places: substract(p.places, materials) }),
			(p: IPotentiality) => ({ ...p, pressure: computePressure(p) }),
		),
	);
};

const materializePotentiality = (
	toPlace: IPotentiality,
	updatePP: (m: IMaterial[]) => IPotentiality[],
	pressure: IPressureChunk[],
): [IMaterial[], IPotentiality[]] => {
	const minMaterial = simulatePlacement(potToSimul('min', toPlace), pressure);
	const maxMaterial = simulatePlacement(potToSimul('target', toPlace), pressure);
	const minPots = updatePP(minMaterial);
	const maxPots = updatePP(maxMaterial);
	const minAvg = potentialsToMeanPressure(minPots);
	const maxAvg = potentialsToMeanPressure(maxPots);
	if (minAvg === maxAvg) {
		return [maxMaterial, maxPots];
	}
	const durationDiff = toPlace.duration.target - toPlace.duration.min;
	const idealDuration =
		toPlace.duration.min + getIntersectionPressure(durationDiff, [minAvg, maxAvg]);
	const material = simulatePlacement(
		{ isSplittable: toPlace.isSplittable, places: toPlace.places, duration: idealDuration },
		pressure,
	);
	const updatedPotentials = updatePP(material);
	throwIfInvalid(validatePotentials)(updatedPotentials);
	return [material, updatedPotentials];
};

const getProportionalPressure = (
	dur1: number,
	press1: number,
	dur2: number,
	press2: number,
): number => {
	const total = dur1 + dur2;
	const newPress1 = press1 * dur1 / total;
	const newPress2 = press2 * dur2 / total;
	return (newPress1 + newPress2) / 2;
};

const computeContiguousPressureChunk = (
	duration: number,
	chunks: IPressureChunk[],
): IPressureChunk[] => {
	const firstTime = chunks[0].start;
	const lastTime = chunks[chunks.length - 1].end;
	return R.unnest(
		chunks.map(c => [
			{ start: c.start, end: c.start + duration },
			{ end: c.end, start: c.end - duration },
		]),
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
					curr.pressure,
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
		return toPlace.places.some(isDuring<IRange>(chunk));
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

/*
 * place potential according to pressureChunk.
 * select least pressured place.
 * place can be on multiple chunks.
 * contiguous condition with isSplittable.
 * use a data-structure/container duration oriented.
 * duration & contiguous -> start & end
 * duration & splittable -> chunks ordered by pressure & prefer contiguous when same pressure.
 */
const simulatePlacement = (
	toPlace: IPotentialitySimul,
	pressure: IPressureChunk[],
): IMaterial[] => {
	if (!toPlace.isSplittable) {
		return placeAtomic(toPlace, pressure);
	}
	return placeSplittable(toPlace, pressure);

	// if (!toPlace.isSplittable) {
	// 	const bestChunk = getMin(
	// 		'pressure',
	// 		pressure.filter(
	// 			R.and(isOverlapping(toPlace.places), (p: IRange) => p.end - p.start > toPlace.duration),
	// 		),
	// 	);
	// 	return {
	// 		end: bestChunk.start + toPlace.duration,
	// 		id: Date.now(),
	// 		start: bestChunk.start,
	// 	};
	// }
};

const validatePotentials = R.none(R.propEq('pressure', -1));
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
	R.mean,
);

const potToSimul = (durationType: keyof ITimeDuration, pot: IPotentiality): IPotentialitySimul => ({
	duration: pot.duration[durationType],
	isSplittable: pot.isSplittable,
	places: pot.places,
});

const queriesToPotentialities = (config: IConfig, queries: IQuery[]): IPotentiality[] => {
	return R.unnest(
		queries.map(
			R.converge(updateChildren, [
				R.ifElse(R.has('goal'), goalToPotentiality(config), atomicToPotentiality(config)),
				queryToMask(config),
			]),
		),
	);
};

const queryToMask = R.curry((config: IConfig, query: IQuery): IRange[] => {
	const timeRestrictions = query.timeRestrictions || {};
	const maskPipeline = R.pipe(
		mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
		mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
		mapToTimeRestriction(timeRestrictions.hour, mapToHourRange),
	);
	return maskPipeline([{ start: config.startDate, end: config.endDate }]);
});

const mapToTimeRestriction = R.curry(
	(tr: ITimeRestriction | undefined, mapFn: mapRange, masks: IRange[]): IRange[] => {
		return tr == null ? masks : R.unnest(masks.map(getMaskFilterFn(tr, mapFn)));
	},
);

const mapToMonthRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstMonthRange(mask), rangesUnfolder(end, 'year'), restricts);
};

const getFirstMonthRange = R.curry((mask: IRange, restrict: IRange): IRange => {
	const startOfYear = +moment(mask.start).startOf('year');
	const start = +addDecimalMonthTo(startOfYear, restrict.start);
	const end = +addDecimalMonthTo(startOfYear, restrict.end);
	return { start, end };
});

const mapToWeekdayRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstWeekdayRange(mask), rangesUnfolder(end, 'week'), restricts);
};

const getFirstWeekdayRange = R.curry((mask: IRange, restrict: IRange): IRange => {
	const startOfWeek = +moment(mask.start).startOf('week');
	const start = +addDecimalDayTo(startOfWeek, restrict.start);
	const end = +addDecimalDayTo(startOfWeek, restrict.end);
	return { start, end };
});

const mapToHourRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstHourRange(mask), rangesUnfolder(end, 'day'), restricts);
};

const restrictsToRanges = (getFirst: getFirstFn, unfoldFn: unfoldRange, restricts: IRange[]) => {
	return R.unnest(restricts.map(R.pipe(getFirst, R.unfold(unfoldFn))));
};

const addDecimalDayTo = (date: number, days: number) =>
	moment(date)
		.add(Math.floor(days), 'day')
		.add((days % 1) * 24, 'hour');
const addDecimalMonthTo = (date: number, month: number) => {
	const mDate = moment(date).add(Math.floor(month), 'month');
	return mDate.add((month % 1) * mDate.daysInMonth(), 'day');
};
const addToTimestamp = (
	nb: moment.DurationInputArg1,
	kind: moment.unitOfTime.DurationConstructor,
) => (ts: number) => +moment(ts).add(nb, kind);

const rangesUnfolder = (end: number, kind: moment.unitOfTime.DurationConstructor) => (
	range: IRange,
): false | [IRange, IRange] => {
	const nextRange = R.map(addToTimestamp(1, kind), range);
	if (range.start >= end) {
		return false;
	}
	return [nextRange, nextRange];
};

const getFirstHourRange = R.curry((mask: IRange, restrict: IRange): IRange => {
	const start = +moment(mask.start)
		.startOf('day')
		.add(restrict.start, 'hour');
	const end = +moment(mask.start)
		.startOf('day')
		.add(restrict.end, 'hour');
	return { start, end };
});

const getMaskFilterFn = (tr: ITimeRestriction, mapFn: mapRange): maskFn => {
	return R.converge(
		(ranges: IRange[], mask: IRange) =>
			tr.condition === RestrictionCondition.InRange ? ranges : complement(mask, ranges),
		[
			R.converge(intersect, [
				R.partial(mapFn, tr.ranges.map(r => ({ start: r[0], end: r[1] }))),
				R.identity,
			]),
			R.identity,
		],
	);
};

const updateChildren = (potentials: IPotentiality[], mask: IRange[]): IPotentiality[] => {
	return potentials.map(
		R.pipe(
			(p: IPotentiality) => ({ ...p, children: intersect(mask, p.places[0]) }),
			(p: IPotentiality) => ({ ...p, pressure: computePressure(p) }),
		),
	);
};

const computePressure = (p: IPotentiality): number => {
	const space = R.sum(p.places.map(c => c.end - c.start));
	return (p.duration.min || 0 + (p.duration.target || 0)) / 2 * space;
};

const ifHasStartEnd = R.ifElse(R.and(R.has('start'), R.has('end')));
const queryIsSplittable = (query: IQuery) =>
	query.goal ? query.goal.kind === GoalKind.Splittable : false;
const getTarget: (s: string) => toNumber = kind => R.pathOr(0, [kind, 'target']);
const qStart: toNumber = getTarget('start');
const qEnd: toNumber = getTarget('end');
const qDuration: toTimeDur = R.pathOr({ min: 0, target: 0 }, ['duration']);
const gQuantity: toTimeDur = R.pathOr({ min: 0, target: 0 }, ['goal', 'quantity']);
const gQuantityTarget: toNumber = R.pipe(gQuantity, R.pathOr(1, ['target']) as toNumber);
const gtime: toNumber = R.pathOr(0, ['goal', 'time']);

const goalToDuration = R.ifElse(queryIsSplittable, gQuantity, qDuration);
const goalToTimeloop = R.ifElse(
	queryIsSplittable,
	gtime,
	R.converge(R.divide, [gtime, gQuantityTarget]),
);

const goalToSubpipes = (config: IConfig, query: IQuery): IRange[] => {
	const start = config.startDate;
	const timeloop = goalToTimeloop(query);
	const maxDuration = config.endDate - config.startDate;
	const subpipeCount = Math.floor(maxDuration / timeloop);
	return R.times(
		i => ({ start: start + timeloop * i, end: start - 1 + timeloop * (i + 1) }),
		subpipeCount,
	);
};

const goalToPotentiality = R.curry((config: IConfig, query: IQuery): IPotentiality[] => {
	const duration = goalToDuration(query);
	const subpipes = goalToSubpipes(config, query);
	return subpipes.map((mask, i) => ({
		duration,
		isSplittable: queryIsSplittable(query),
		name: `${query.name}-goal-${i}`,
		places: [mask],
		pressure: -1,
	}));
});

const atomicToDuration = ifHasStartEnd(
	R.pipe(R.converge(R.subtract, [qEnd, qStart]), R.assoc('target', R.__, {})),
	qDuration,
);
const atomicToChildren = (c: IConfig) =>
	ifHasStartEnd(
		R.applySpec<IRange>({ start: qStart, end: qEnd }),
		R.always<IRange>({ start: c.startDate, end: c.endDate }),
	);

const atomicToPotentiality = R.curry((config: IConfig, query: IQuery): IPotentiality[] => {
	const duration = atomicToDuration(query) as ITimeDuration;
	const places = [atomicToChildren(config)(query)];
	const name = `${query.name}-atomic`;
	return [{ isSplittable: queryIsSplittable(query), places, duration, name, pressure: -1 }];
});
