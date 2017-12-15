import * as Q from '@autoschedule/queries-fn';
import test from 'ava';
import * as moment from 'moment';

import { schedule } from './main.flow';

import { IConfig } from '../data-structures/config.interface';
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';

const dur = moment.duration;

const validateSE = (t: any, material: IMaterial, range: [number, number], id: number): void => {
  t.true(material.start === range[0]);
  t.true(material.end === range[1]);
  t.true(material.id === id);
};

test('will schedule nothing when no queries', t => {
  const config: IConfig = { endDate: +moment().add(7, 'days'), startDate: Date.now() };
  const result = schedule(config, []);
  t.true(result.length === 0);
});

test('will schedule one atomic query', t => {
  const config: IConfig = { endDate: +moment().add(1, 'days'), startDate: Date.now() };
  const durTarget = +dur(1.5, 'hours');
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.duration(Q.timeDuration(durTarget, +dur(1, 'hours')))),
  ];
  const result = schedule(config, queries);
  t.true(result.length === 1);
  t.true(result[0].start === config.startDate);
  t.true(result[0].end === config.startDate + durTarget);
});

test('will throw ConflictError when conflict found', t => {
  const now = moment();
  const config: IConfig = { endDate: +moment(now).add(5, 'hours'), startDate: +now };
  const atomicStart = +moment(now).add(1, 'hour');
  const atomicEnd = +moment(now).add(3, 'hour');
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.name('atomic 1'), Q.start(atomicStart), Q.end(atomicEnd)),
    Q.queryFactory(Q.id(2), Q.name('atomic 2'), Q.start(atomicStart), Q.end(atomicEnd + 10)),
  ];
  try {
    schedule(config, queries);
    t.fail('should throw');
  } catch (e) {
    t.true(e instanceof ConflictError);
    const err = e as ConflictError;
    t.is(err.victim, 1);
    t.true(err.materials.length === 0);
  }
});

test('will schedule one atomic goal query', t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: Q.IQuery[] = [
    Q.queryFactory(
      Q.duration(Q.timeDuration(durTarget)),
      Q.goal(Q.GoalKind.Atomic, Q.timeDuration(2), +dur(1, 'day'))
    ),
  ];
  const result = schedule(config, queries);
  t.true(result.length === 2 * 3);
  result.forEach(material => {
    const matDur = material.end - material.start;
    t.true(matDur === durTarget);
  });
});

test('will schedule one splittable goal with one atomic', t => {
  const now = moment();
  const config: IConfig = { endDate: +moment(now).add(5, 'hours'), startDate: +now };
  const atomicStart = +moment(now).add(1, 'hour');
  const atomicEnd = +moment(now).add(3, 'hour');
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.name('atomic 1'), Q.start(atomicStart), Q.end(atomicEnd)),
    Q.queryFactory(
      Q.id(2),
      Q.name('splittable goal 1'),
      Q.goal(Q.GoalKind.Splittable, Q.timeDuration(+dur(3, 'hours')), +dur(5, 'hours'))
    ),
  ];
  const result = schedule(config, queries);

  t.true(result.length === 3);
  validateSE(t, result[0], [+now, atomicStart], 2);
  validateSE(t, result[1], [atomicStart, atomicEnd], 1);
  validateSE(t, result[2], [atomicEnd, config.endDate], 2);
});
