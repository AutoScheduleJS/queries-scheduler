import {
  IGoalQuery,
  IProviderQuery,
  IQuery,
  isGoalQuery,
  isProviderQuery,
} from '@autoschedule/queries-fn';

import * as R from 'ramda';
import 'rxjs/add/observable/combineLatest';
import 'rxjs/add/observable/forkJoin';
import 'rxjs/add/observable/of';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { ConnectableObservable } from 'rxjs/observable/ConnectableObservable';
import { combineLatest, distinctUntilChanged, map, publishReplay } from 'rxjs/operators';
import { Subject } from 'rxjs/Subject';

import {
  computePressureChunks,
  materializePotentiality,
  updatePotentialsPressureFromMats,
  updatePotentialsPressureFromPots,
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
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IPressureChunk } from '../data-structures/pressure-chunk.interface';
import { IRange } from '../data-structures/range.interface';

const sortByStart = R.sortBy<IMaterial>(R.prop('start'));
const getMax = <T>(prop: keyof T, list: T[]): T =>
  R.reduce(R.maxBy(R.prop(prop) as (n: any) => number), list[0], list);

export const queriesToPipeline$ = (config: IConfig) => (stateManager: stateManagerType) => (
  queries: ReadonlyArray<IQuery>
): Observable<ReadonlyArray<IMaterial>> => {
  return Observable.forkJoin(queriesToPipelineDebug$(config, false)(stateManager)(queries)).pipe(
    map((values: any) => {
      if (values[0] != null) {
        throw valueToError(values);
      }
      return values[2];
    })
  );
};

const valueToError = (values: any) => {
  return new Error(`${values[0]}`);
};

export type stateManagerType = (
  c: IConfig
) => (q: IQuery[]) => (q: IQuery, p: IPotentiality[], m: IMaterial[]) => IRange[];

export const queriesToPipelineDebug$ = (config: IConfig, debug?: boolean) => (
  stateManager: stateManagerType
) => (
  queries: ReadonlyArray<IQuery>
): [
  Observable<any>,
  ConnectableObservable<ReadonlyArray<IPotentiality>>,
  ConnectableObservable<ReadonlyArray<IMaterial>>,
  ConnectableObservable<ReadonlyArray<IPressureChunk>>
] => {
  const potentialsBS$ = new BehaviorSubject([] as ReadonlyArray<IPotentiality>);
  const materialsBS$ = new BehaviorSubject([] as ReadonlyArray<IMaterial>);
  const errorsBS$ = new BehaviorSubject(null);
  const potentialsWorking$: Subject<boolean> = new Subject();
  const materialsWorking$: Subject<boolean> = new Subject();
  const potentialsOb$ = distinctPotentials$(potentialsWorking$, potentialsBS$);
  const materialsOb$ = distinctMaterials$(materialsWorking$, materialsBS$.pipe(map(sortByStart)));
  const pressureChunk$ = new BehaviorSubject([] as ReadonlyArray<IPressureChunk>);
  const potentialsDebug$ = potentialsOb$.pipe(publishReplay()) as ConnectableObservable<
    ReadonlyArray<IPotentiality>
  >;
  const materialsDebug$ = materialsOb$.pipe(publishReplay()) as ConnectableObservable<
    ReadonlyArray<IMaterial>
  >;
  const pressureChunkDebug$ = pressureChunk$.pipe(publishReplay()) as ConnectableObservable<
    ReadonlyArray<IPressureChunk>
  >;
  const userstateHandler = stateManager(config);
  const toClose = closeAllBS(potentialsBS$, materialsBS$, errorsBS$, pressureChunk$);

  potentialsDebug$.connect();
  materialsDebug$.connect();
  pressureChunkDebug$.connect();

  potentialsWorking$.pipe(combineLatest(materialsWorking$)).subscribe(testWorkers(toClose));
  Observable.combineLatest(potentialsOb$, materialsOb$).subscribe(
    buildPotentials(config, replacePotentials(potentialsBS$), userstateHandler, queries, errorsBS$)
  );
  potentialsBS$.subscribe(
    buildMaterials(config, addMaterials(materialsBS$), pressureChunk$, errorsBS$)
  );
  return [errorsBS$, potentialsDebug$, materialsDebug$, pressureChunkDebug$];
};

export const combineSchedulerObservables = (
  ...schedulerObs: Array<Observable<any>>
): Observable<any[]> => {
  const bs = schedulerObs.map(_ => new BehaviorSubject<any>(null));
  setTimeout(() => {
    bs.forEach((s, i) => schedulerObs[i].subscribe(v => s.next(v), undefined, () => s.complete()));
  }, 0);

  return Observable.combineLatest(bs);
};

const closeAllBS = (...toClose: Array<BehaviorSubject<any>>) => (): void => {
  toClose.forEach(bs => bs.complete());
};

const testWorkers = (toClose: () => void) => (workStatus: boolean[]): void => {
  if (workStatus.some(status => status == null || status)) {
    return;
  }
  setTimeout(() => toClose(), 0);
};

const distinctMaterials$ = (
  workingStatus$: Subject<boolean>,
  mats$: Observable<ReadonlyArray<IMaterial>>
): Observable<ReadonlyArray<IMaterial>> => {
  return mats$.pipe(
    distinctUntilChanged((x, y) => {
      const isDistinct =
        x.length === y.length &&
        x.every((xa, i) => {
          const ya = y[i];
          return xa.start === ya.start && xa.end === ya.end && xa.materialId === ya.materialId;
        });
      workingStatus$.next(!isDistinct);
      return isDistinct;
    })
  );
};

const distinctPotentials$ = (
  workingStatus$: Subject<boolean>,
  pots$: Observable<ReadonlyArray<IPotentiality>>
): Observable<ReadonlyArray<IPotentiality>> => {
  return pots$.pipe(
    distinctUntilChanged((x, y) => {
      const isDistinct =
        x.length === y.length &&
        x.every((xa, i) => {
          const xb = y[i];
          return (
            xa.queryId === xb.queryId &&
            xa.pressure === xb.pressure &&
            xa.duration.min === xb.duration.min &&
            xa.duration.target === xb.duration.target &&
            xa.places.length === xb.places.length &&
            xa.places.every((xaa, ii) => {
              const xbb = xb.places[ii];
              return xaa.start === xbb.start && xaa.end === xbb.end;
            })
          );
        });
      workingStatus$.next(!isDistinct);
      return isDistinct;
    })
  );
};

const buildMaterials = (
  config: IConfig,
  replaceMatsFn: (mats: ReadonlyArray<IMaterial>) => void,
  pressureChunk$: BehaviorSubject<ReadonlyArray<IPressureChunk>>,
  error$: BehaviorSubject<any>
) => (potentials: ReadonlyArray<IPotentiality>): void => {
  const result = sortByStart(
    R.unnest(R.unfold(R.partial(pipelineUnfolder, [config, pressureChunk$, error$]), potentials))
  ) as IMaterial[];
  replaceMatsFn(result);
};

type handleUserState = (
  queries: IQuery[]
) => (query: IQuery, potentials: IPotentiality[], materials: IMaterial[]) => IRange[];

const buildPotentials = (
  config: IConfig,
  replacePotsFn: (pots: ReadonlyArray<IPotentiality>) => void,
  userstateHandler: handleUserState,
  queries: ReadonlyArray<IQuery>,
  error$: BehaviorSubject<any>
) => ([potentials, materials]: [ReadonlyArray<IPotentiality>, ReadonlyArray<IMaterial>]): void => {
  const newUserstateHandler = (query: IQuery, pots: ReadonlyArray<IPotentiality>) => {
    try {
      const otherPots = pots.filter(
        pot =>
          !materials.find(mat => mat.queryId === pot.queryId && mat.materialId === pot.potentialId)
      );
      const otherMats = materials.filter(mat => mat.queryId !== query.id);
      const userstateMask = userstateHandler([...queries])(query, [...otherPots], [...otherMats]);
      return userstateMask;
    } catch (e) {
      error$.next(e);
      return [{ start: -2, end: -2 }];
    }
  };

  const result = updatePotentialsPressureFromMats(
    queriesToPotentialities(config, queries, potentials, newUserstateHandler),
    materials
  );
  const filteredResult = result.filter(pot => pot.places.length);
  if (result.length === filteredResult.length) {
    error$.next(null);
  }
  replacePotsFn(filteredResult);
};

const queriesToPotentialities = (
  config: IConfig,
  queries: ReadonlyArray<IQuery>,
  potentials: ReadonlyArray<IPotentiality>,
  userstateHandler: (q: IQuery, p: ReadonlyArray<IPotentiality>) => IRange[]
): IPotentiality[] =>
  R.unnest(
    queries.map(
      R.converge(updatePotentialsPressureFromPots, [
        queryToPotentiality(config),
        queryToMask(config),
        (q: IQuery) => userstateHandler(q, potentials),
      ])
    )
  );

const replacePotentials = (potentials$: BehaviorSubject<ReadonlyArray<IPotentiality>>) => (
  potentials: ReadonlyArray<IPotentiality>
): void => {
  potentials$.next(potentials);
};

const addMaterials = (materials$: BehaviorSubject<ReadonlyArray<IMaterial>>) => (
  materials: ReadonlyArray<IMaterial>
): void => {
  materials$.next([...materials]);
};

const queryToPotentiality = (config: IConfig) => (query: IQuery) => {
  if (isGoalQuery(query)) {
    return goalToPotentiality(config)(query);
  }
  return atomicToPotentiality(config)(query);
};

const pipelineUnfolder = (
  config: IConfig,
  pressureChunk$: BehaviorSubject<ReadonlyArray<IPressureChunk>>,
  error$: BehaviorSubject<any>,
  potentials: IPotentiality[]
): false | [IMaterial[], IPotentiality[]] => {
  if (potentials.length < 1) {
    return false;
  }
  const toPlace = getMax('pressure', potentials);
  const newPotentials = R.without([toPlace], potentials);
  const result = materializePotentiality(
    toPlace,
    R.partial(updatePotentialsPressureFromMats, [newPotentials]),
    emitPressureChunks(pressureChunk$, computePressureChunks(config, newPotentials)),
    error$
  );
  return result;
};

const emitPressureChunks = (
  pressureChunk$: BehaviorSubject<ReadonlyArray<IPressureChunk>>,
  pressureChunk: IPressureChunk[]
): IPressureChunk[] => {
  pressureChunk$.next(pressureChunk);
  return pressureChunk;
};

const queryToMask = R.curry((config: IConfig, query: IQuery): IRange[] => {
  if (isGoalQuery(query) || isProviderQuery(query)) {
    return timeRestToMask(config, query);
  }
  return [{ start: config.startDate, end: config.endDate }];
});

const timeRestToMask = (config: IConfig, query: IGoalQuery | IProviderQuery): IRange[] => {
  const timeRestrictions = query.timeRestrictions || {};
  const maskPipeline = R.pipe(
    mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
    mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
    mapToTimeRestriction(timeRestrictions.hour, mapToHourRange)
  );
  return maskPipeline([{ start: config.startDate, end: config.endDate }]);
};
