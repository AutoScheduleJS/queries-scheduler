import { IQuery } from '@autoschedule/queries-fn';
import { IConfig } from '../data-structures/config.interface';

import { queriesToPipeline$ } from './scheduler.flow';

/**
 * Role: resolve conflict from missing provider. Update queries with agent feedback.
 * Ask for placeholder and query's content and transforms
 */
export const schedule$ = (agentRelay: any, conflictResolver: any, config: IConfig) => (
  queries: ReadonlyArray<IQuery>
) => {};
