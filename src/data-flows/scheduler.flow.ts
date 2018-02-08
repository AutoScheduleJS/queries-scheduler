import {
  IGoalQuery,
  IProviderQuery,
  IQuery,
  isGoalQuery,
  isProviderQuery,
} from '@autoschedule/queries-fn';

import * as R from 'ramda';
import 'rxjs/add/observable/combineLatest';
import 'rxjs/add/observable/of';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { ConnectableObservable } from 'rxjs/observable/ConnectableObservable';
import {
  combineLatest,
  distinctUntilChanged,
  map,
  publishReplay,
  takeLast,
} from 'rxjs/operators';
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
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';
import { IPotentiality } from '../data-structures/potentiality.interface';
import { IRange } from '../data-structures/range.interface';

const sortByStart = R.sortBy<IMaterial>(R.prop('start'));
const getMax = <T>(prop: keyof T, list: T[]): T =>
  R.reduce(R.maxBy(R.prop(prop) as (n: any) => number), list[0], list);

export const queriesToPipeline$ = (config: IConfig) => (stateManager: stateManagerType) => (
  queries: ReadonlyArray<IQuery>
): Observable<ReadonlyArray<IMaterial>> => {
  return queriesToPipelineDebug$(config, false)(stateManager)(queries)[2].pipe(takeLast(1));
};

export type stateManagerType = (
  c: IConfig
) => (q: IQuery[]) => (q: IQuery, p: IPotentiality[], m: IMaterial[]) => IRange[];

export const queriesToPipelineDebug$ = (config: IConfig, debug?: boolean) => (
  stateManager: stateManagerType
) => (
  queries: ReadonlyArray<IQuery>
): [
  Observable<any> | undefined,
  ConnectableObservable<ReadonlyArray<IPotentiality>>,
  ConnectableObservable<ReadonlyArray<IMaterial>>
] => {
  const potentialsBS$ = new BehaviorSubject([] as ReadonlyArray<IPotentiality>);
  const materialsBS$ = new BehaviorSubject([] as ReadonlyArray<IMaterial>);
  const errorsBS$ = debug ? new BehaviorSubject(null) : undefined;
  const potentialsWorking$: Subject<boolean> = new Subject();
  const materialsWorking$: Subject<boolean> = new Subject();
  const potentialsOb$ = distinctPotentials$(potentialsWorking$, potentialsBS$);
  const materialsOb$ = distinctMaterials$(materialsWorking$, materialsBS$.pipe(map(sortByStart)));
  const potentialsDebug$ = potentialsOb$.pipe(publishReplay()) as ConnectableObservable<
    ReadonlyArray<IPotentiality>
  >;
  const materialsDebug$ = materialsOb$.pipe(publishReplay()) as ConnectableObservable<
    ReadonlyArray<IMaterial>
  >;
  const userstateHandler = stateManager(config);
  const toClose = closeAllBS(potentialsBS$, materialsBS$, errorsBS$);

  potentialsDebug$.connect();
  materialsDebug$.connect();

  potentialsWorking$.pipe(combineLatest(materialsWorking$)).subscribe(testWorkers(toClose));
  terminateIfError(errorsBS$, toClose);
  Observable.combineLatest(potentialsOb$, materialsOb$).subscribe(
    buildPotentials(config, replacePotentials(potentialsBS$), userstateHandler, queries, errorsBS$)
  );
  potentialsBS$.subscribe(buildMaterials(config, addMaterials(materialsBS$), errorsBS$));
  return [errorsBS$, potentialsDebug$, materialsDebug$];
};

export const combineSchedulerObservables = (
  schedulerObs: [
    Observable<any>,
    ConnectableObservable<ReadonlyArray<IPotentiality>>,
    ConnectableObservable<ReadonlyArray<IMaterial>>
  ]
): Observable<{
  error: any;
  potentials: ReadonlyArray<IPotentiality>;
  materials: ReadonlyArray<IMaterial>;
}> => {
  const pots$ = new BehaviorSubject<ReadonlyArray<IPotentiality>>([]);
  const mats$ = new BehaviorSubject<ReadonlyArray<IMaterial>>([]);
  setTimeout(() => {
    schedulerObs[1].subscribe(v => pots$.next(v), undefined, () => pots$.complete());
    schedulerObs[2].subscribe(v => mats$.next(v), undefined, () => mats$.complete());
  }, 0);

  return Observable.combineLatest(
    schedulerObs[0],
    pots$,
    mats$,
    (error, potentials, materials) => ({ error, potentials, materials })
  ).pipe(
    distinctUntilChanged((a, b) => {
      return (
        a.materials.length === b.materials.length &&
        a.potentials.length === b.potentials.length
      );
    })
  );
};

const closeAllBS = (...toClose: Array<BehaviorSubject<any> | undefined>) => (): void => {
  toClose.forEach(bs => (bs ? bs.complete() : null));
};

const terminateIfError = (
  errorsBS: BehaviorSubject<any> | undefined,
  toClose: () => void
): void => {
  if (!errorsBS) {
    return;
  }
  errorsBS.subscribe(e => {
    if (e == null) {
      return;
    }
    setTimeout(() => toClose(), 0);
  });
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
  addMatsFn: (mats: ReadonlyArray<IMaterial>) => void,
  debug?: BehaviorSubject<any> | undefined
) => (potentials: ReadonlyArray<IPotentiality>): void => {
  const result = sortByStart(
    R.unnest(R.unfold(R.partial(pipelineUnfolder, [config]), potentials))
  ) as IMaterial[];
  try {
    validateTimeline(result);
  } catch (e) {
    if (!debug) {
      throw e;
    }
    debug.next(e);
  }
  addMatsFn(result);
};

type handleUserState = (
  queries: IQuery[]
) => (query: IQuery, potentials: IPotentiality[], materials: IMaterial[]) => IRange[];

const buildPotentials = (
  config: IConfig,
  replacePotsFn: (pots: ReadonlyArray<IPotentiality>) => void,
  userstateHandler: handleUserState,
  queries: ReadonlyArray<IQuery>,
  errorDebug: BehaviorSubject<any> | undefined
) => ([potentials, materials]: [ReadonlyArray<IPotentiality>, ReadonlyArray<IMaterial>]): void => {
  const newUserstateHandler = (query: IQuery, pot: ReadonlyArray<IPotentiality>) => {
    try {
      return userstateHandler([...queries])(query, [...pot], [...materials]);
    } catch (e) {
      if (!errorDebug) {
        throw e;
      }
      errorDebug.next(e);
      return [{ start: -2, end: -2 }];
    }
  };
  const result = updatePotentialsPressureFromMats(
    queriesToPotentialities(config, queries, potentials, newUserstateHandler).filter(pots =>
      materials.every(material => material.materialId !== pots.potentialId)
    ),
    materials
  );
  replacePotsFn(result);
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
  materials$.next([...materials$.value, ...materials]);
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
      R.partial(updatePotentialsPressureFromMats, [newPotentials]),
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

const timeRestToMask = (config: IConfig, query: IGoalQuery | IProviderQuery): IRange[] => {
  const timeRestrictions = query.timeRestrictions || {};
  const maskPipeline = R.pipe(
    mapToTimeRestriction(timeRestrictions.month, mapToMonthRange),
    mapToTimeRestriction(timeRestrictions.weekday, mapToWeekdayRange),
    mapToTimeRestriction(timeRestrictions.hour, mapToHourRange)
  );
  return maskPipeline([{ start: config.startDate, end: config.endDate }]);
};
