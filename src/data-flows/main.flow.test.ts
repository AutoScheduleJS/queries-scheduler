import test from 'ava';
import * as moment from 'moment';

import { schedule } from './main.flow';

import { IConfig } from '../data-structures/config.interface';
import { QueryKind } from '../data-structures/query.enum';
import { IQuery } from '../data-structures/query.interface';

const dur = moment.duration;

test('will schedule nothing when no queries', async t => {
  const config: IConfig = {
    endDate: moment()
      .add(7, 'days')
      .millisecond(),
    startDate: Date.now(),
  };
  const result = await schedule(config, []);
  t.true(result.length === 0);
});

test('will schedule queries', async t => {
  const config: IConfig = {
    endDate: +moment().add(1, 'days'),
    startDate: Date.now(),
  };
  const queries: IQuery[] = [
    {
      duration: { min: +dur(1, 'hours'), target: +dur(1.5, 'hours') },
      id: 1,
      kind: QueryKind.Atomic,
      name: 'atomic 1',
    },
  ];
  const result = await schedule(config, queries);
  t.true(result.length === 1);
});
