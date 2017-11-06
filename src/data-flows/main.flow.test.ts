import test from 'ava';
import * as moment from 'moment';

import { IConfig } from '../data-structures/config.interface';
import { schedule } from './main.flow';

test('will schedule', async t => {
	const config: IConfig = {
		endDate: moment()
			.add(7, 'days')
			.millisecond(),
		startDate: Date.now(),
	};
	const result = await schedule(config, []);
	t.true(result.length === 0);
});
