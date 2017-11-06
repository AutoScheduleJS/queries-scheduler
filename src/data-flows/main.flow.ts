import { queriesToPipeline } from '../data-flows/pipes.flow';

import { IConfig } from '../data-structures/config.interface';
import { IMaterial } from '../data-structures/material.interface';
import { IQuery } from '../data-structures/query.interface';

export function schedule(config: IConfig, queries: IQuery[]): Promise<IMaterial[]> {
	const pipeline: IMaterial[] = queriesToPipeline(config, queries);

	return Promise.resolve(pipeline);
}
