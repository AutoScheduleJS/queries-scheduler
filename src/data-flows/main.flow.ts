import { IQuery } from '@autoschedule/queries-fn';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import { IConfig } from '../data-structures/config.interface';

import { queriesToPipeline$ } from './scheduler.flow';

/**
 * Role: resolve conflict from missing provider.
 * Ask for placeholder and query's content and transforms
 * Update queries with agent feedback.
 */
export const schedule$ = (agentRelay: any, conflictResolver: any, config: IConfig) => (
  queries: ReadonlyArray<IQuery>
) => {
  const queries$ = new BehaviorSubject(queries);
};
