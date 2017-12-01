import { complement, intersect } from 'intervals-fn';
import * as moment from 'moment';
import * as R from 'ramda';

import { IConfig } from '../data-structures/config.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { GoalKind, RestrictionCondition } from '../data-structures/query.enum';
import { IQuery, ITimeDuration, ITimeRestriction } from '../data-structures/query.interface';
import { IRange } from '../data-structures/range.interface';

import { computePressure } from './pipes.flow';

type maskFn = (tm: IRange) => IRange[];
type mapRange = (r: IRange[], tm: IRange) => IRange[];
type toNumber = (o: any) => number;
type getFirstFn = (rest: IRange) => IRange;
type unfoldRange = (seed: IRange) => false | [IRange, IRange];
type toTimeDur = (o: any) => ITimeDuration;

export const mapToMonthRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstMonthRange(mask), rangesUnfolder(end, 'year'), restricts);
};

const getFirstMonthRange = R.curry((mask: IRange, restrict: IRange): IRange => {
	const startOfYear = +moment(mask.start).startOf('year');
	const start = +addDecimalMonthTo(startOfYear, restrict.start);
	const end = +addDecimalMonthTo(startOfYear, restrict.end);
	return { start, end };
});

export const mapToWeekdayRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstWeekdayRange(mask), rangesUnfolder(end, 'week'), restricts);
};

const getFirstWeekdayRange = R.curry((mask: IRange, restrict: IRange): IRange => {
	const startOfWeek = +moment(mask.start).startOf('week');
	const start = +addDecimalDayTo(startOfWeek, restrict.start);
	const end = +addDecimalDayTo(startOfWeek, restrict.end);
	return { start, end };
});

export const mapToHourRange = (restricts: IRange[], mask: IRange): IRange[] => {
	const end = +moment(mask.end).endOf('day');
	return restrictsToRanges(getFirstHourRange(mask), rangesUnfolder(end, 'day'), restricts);
};

export const mapToTimeRestriction = (tr: ITimeRestriction | undefined, mapFn: mapRange) => (
	masks: IRange[],
): IRange[] => {
	return tr == null ? masks : R.unnest(masks.map(getMaskFilterFn(tr, mapFn)));
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

export const updateChildren = (potentials: IPotentiality[], mask: IRange[]): IPotentiality[] => {
	return potentials.map(
		R.pipe(
			(p: IPotentiality) => ({ ...p, children: intersect(mask, p.places[0]) }),
			(p: IPotentiality) => ({ ...p, pressure: computePressure(p) }),
		),
	);
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

export const goalToPotentiality = (config: IConfig) => (query: IQuery): IPotentiality[] => {
	const duration = goalToDuration(query);
	const subpipes = goalToSubpipes(config, query);
	return subpipes.map((mask, i) => ({
		duration,
		isSplittable: queryIsSplittable(query),
		name: `${query.name}-goal-${i}`,
		places: [mask],
		pressure: -1,
	}));
};

const atomicToDuration = ifHasStartEnd(
	R.pipe(R.converge(R.subtract, [qEnd, qStart]), R.assoc('target', R.__, {})),
	qDuration,
);
const atomicToChildren = (c: IConfig) =>
	ifHasStartEnd(
		R.applySpec<IRange>({ start: qStart, end: qEnd }),
		R.always<IRange>({ start: c.startDate, end: c.endDate }),
	);

export const atomicToPotentiality = (config: IConfig) => (query: IQuery): IPotentiality[] => {
	const duration = atomicToDuration(query) as ITimeDuration;
	const places = [atomicToChildren(config)(query)];
	const name = `${query.name}-atomic`;
	return [{ isSplittable: queryIsSplittable(query), places, duration, name, pressure: -1 }];
};
