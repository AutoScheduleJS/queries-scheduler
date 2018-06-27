import { IQueryInternal } from '@autoschedule/queries-fn';
import { unnest } from 'ramda';
import { BehaviorSubject, Observable } from 'rxjs';
import { catchError, filter, switchMap } from 'rxjs/operators';
import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { queriesToPipeline$, stateManagerType } from './scheduler.flow';
export { placeToRange } from './pipes.flow';

type IQuery = IQueryInternal;

type askDetailsType = (
  s: ReadonlyArray<IMaterial>
) => Array<{ readonly id: number; readonly queries: ReadonlyArray<IQuery> }>;
type conflictResolverType = (
  queries: ReadonlyArray<IQuery>,
  error: any
) => Observable<ReadonlyArray<IQuery>>;

export const getSchedule$ = (
  askDetails: askDetailsType,
  conflictResolver: conflictResolverType,
  config: IConfig
) => (stateManager: stateManagerType) => (
  queries: ReadonlyArray<IQuery>
): Observable<ReadonlyArray<IMaterial>> => {
  const queries$ = new BehaviorSubject(queries);
  return queries$.pipe(
    switchMap(retryWithProvider$(conflictResolver, queriesToPipeline$(config)(stateManager))),
    filter(scheduleToDetails(queries$, askDetails))
  );
};

type queriesToPipeline = (q: ReadonlyArray<IQuery>) => Observable<ReadonlyArray<IMaterial>>;

const scheduleToDetails = (
  bs: BehaviorSubject<ReadonlyArray<IQuery>>,
  askDetails: askDetailsType
) => (schedule: ReadonlyArray<IMaterial>) => {
  const res = askDetails(schedule);
  if (!res.length) {
    return true;
  }
  const values = bs.value.map(query => {
    const queries = res.find(rep => rep.id === query.id);
    if (!queries) {
      return [];
    }
    return queries.queries;
  });
  bs.next(unnest(values));
  return false;
};

const retryWithProvider$ = (
  conflictResolver: conflictResolverType,
  toPipeline: queriesToPipeline
) => (queries: ReadonlyArray<IQuery>): Observable<ReadonlyArray<IMaterial>> => {
  return toPipeline(queries).pipe(
    catchError(error => {
      return conflictResolver(queries, error).pipe(
        switchMap(retryWithProvider$(conflictResolver, toPipeline))
      );
    })
  );
};
