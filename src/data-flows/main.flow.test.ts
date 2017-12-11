import test from 'ava';
import * as moment from 'moment';

import { schedule } from './main.flow';

import { IConfig } from '../data-structures/config.interface';
import { GoalKind, QueryKind } from '../data-structures/query.enum';
import { IQuery } from '../data-structures/query.interface';

const dur = moment.duration;

test('will schedule nothing when no queries', async t => {
  const config: IConfig = { endDate: +moment().add(7, 'days'), startDate: Date.now() };
  const result = await schedule(config, []);
  t.true(result.length === 0);
});

test('will schedule one atomic query', async t => {
  const config: IConfig = { endDate: +moment().add(1, 'days'), startDate: Date.now() };
  const durTarget = +dur(1.5, 'hours');
  const queries: IQuery[] = [
    {
      duration: { min: +dur(1, 'hours'), target: durTarget },
      id: 1,
      kind: QueryKind.Atomic,
      name: 'atomic 1',
    },
  ];
  const result = await schedule(config, queries);
  t.true(result.length === 1);
  t.true(result[0].start === config.startDate);
  t.true(result[0].end === config.startDate + durTarget);
});

test('will schedule one atomic goal query', async t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: IQuery[] = [
    {
      duration: { min: durTarget, target: durTarget },
      goal: {
        kind: GoalKind.Atomic,
        quantity: { min: 2, target: 2 },
        time: +dur(1, 'day'),
      },
      id: 1,
      kind: QueryKind.Atomic,
      name: 'atomic goal 1',
    },
  ];
  const result = await schedule(config, queries);
  t.true(result.length === 2 * 3);
  result.forEach(material => {
    const matDur = material.end - material.start;
    t.true(matDur === durTarget);
  });
});

test.only('will schedule one splittable goal with one atomic', async t => {
  const now = moment();
  const config: IConfig = { endDate: +moment(now).add(5, 'hours'), startDate: +now };
  const atomicStart = +moment().add(1, 'hour');
  const atomicEnd = +moment().add(3, 'hour');
  const queries: IQuery[] = [
    {
      end: { max: atomicEnd, min: atomicEnd, target: atomicEnd },
      id: 1,
      kind: QueryKind.Atomic,
      name: 'atomic 1',
      start: { max: atomicStart, min: atomicStart, target: atomicStart },
    },
    {
      goal: {
        kind: GoalKind.Splittable,
        quantity: { min: +dur(2.5, 'hours'), target: +dur(2.5, 'hours') },
        time: +dur(5, 'hours'),
      },
      id: 2,
      kind: QueryKind.Atomic,
      name: 'splittable goal 1',
    },
  ];
  const result = await schedule(config, queries);
  t.true(result.length);
});
