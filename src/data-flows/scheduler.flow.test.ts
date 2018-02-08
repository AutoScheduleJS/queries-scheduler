import * as Q from '@autoschedule/queries-fn';
import { queryToStatePotentials } from '@autoschedule/userstate-manager';
import test from 'ava';
import * as moment from 'moment';
import 'rxjs/add/observable/forkJoin';
import 'rxjs/add/observable/of';
import { Observable } from 'rxjs/Observable';
import { map, takeLast } from 'rxjs/operators';

import {
  combineSchedulerObservables,
  queriesToPipeline$,
  queriesToPipelineDebug$,
} from './scheduler.flow';

import { IConfig } from '../data-structures/config.interface';
import { ConflictError } from '../data-structures/conflict.error';
import { IMaterial } from '../data-structures/material.interface';

const dur = moment.duration;
const stateManager = queryToStatePotentials([]);

const validateSE = (t: any, material: IMaterial, range: [number, number], id: number): void => {
  t.is(material.start, range[0]);
  t.is(material.end, range[1]);
  t.is(material.queryId, id);
};

test('will schedule nothing when no queries', t => {
  t.plan(1);
  const config: IConfig = { endDate: +moment().add(7, 'days'), startDate: Date.now() };
  return queriesToPipeline$(config)(stateManager)([]).pipe(map(result2 => t.is(result2.length, 0)));
});

test('will schedule dummy query', t => {
  t.plan(1);
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQuery[] = [Q.queryFactory(Q.id(1))];
  return (queriesToPipelineDebug$(config, true)(stateManager)(queries)[0] as Observable<any>).pipe(
    map(_ => {
      t.pass();
    })
  );
});

test('will schedule even if duration target is unreachable', t => {
  t.plan(3);
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.duration(Q.timeDuration(4, 2)), Q.start(97)),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 1);
      t.is(result[0].start, 97);
      t.is(result[0].end, 100);
    })
  );
});

test('will schedule one atomic query', t => {
  t.plan(3);
  const config: IConfig = { endDate: +moment().add(1, 'days'), startDate: Date.now() };
  const durTarget = +dur(1.5, 'hours');
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.duration(Q.timeDuration(durTarget, +dur(1, 'hours')))),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 1);
      t.is(result[0].start, config.startDate);
      t.is(result[0].end, config.startDate + durTarget);
    })
  );
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
    queriesToPipeline$(config)(stateManager)(queries).subscribe(
      e => t.fail('should not pass'),
      e => t.fail('should fail through exception')
    );
  } catch (e) {
    t.true(e instanceof ConflictError);
    const err = e as ConflictError;
    t.is(err.victim, 1);
    t.is(err.materials.length, 0);
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
  t.plan(3 * 2 + 1);
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 2 * 3);
      result.forEach(material => {
        const matDur = material.end - material.start;
        t.is(matDur, durTarget);
      });
    })
  );
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
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.true(result.length === 3);
      validateSE(t, result[0], [+now, atomicStart], 2);
      validateSE(t, result[1], [atomicStart, atomicEnd], 1);
      validateSE(t, result[2], [atomicEnd, config.endDate], 2);
    })
  );
});

test('will emit error from userstate', t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: Q.IQuery[] = [
    Q.queryFactory(
      Q.duration(Q.timeDuration(durTarget)),
      Q.goal(Q.GoalKind.Atomic, Q.timeDuration(2), +dur(1, 'day')),
      Q.transforms([Q.need(true)], [], [])
    ),
  ];
  try {
    queriesToPipeline$(config)(stateManager)(queries).subscribe(
      e => t.fail('should not pass'),
      e => t.fail('should fail through exception')
    );
  } catch (e) {
    t.pass('should emit errors');
  }
});

test('debug version will emit errors and close stream', t => {
  const now = moment();
  const config: IConfig = { endDate: +moment(now).add(5, 'hours'), startDate: +now };
  const atomicStart = +moment(now).add(1, 'hour');
  const atomicEnd = +moment(now).add(3, 'hour');
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.name('atomic 1'), Q.start(atomicStart), Q.end(atomicEnd)),
    Q.queryFactory(Q.id(2), Q.name('atomic 2'), Q.start(atomicStart), Q.end(atomicEnd + 10)),
  ];
  const [errors] = queriesToPipelineDebug$(config, true)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return errors.pipe(
    map(e => {
      t.true(e instanceof ConflictError);
      const err = e as ConflictError;
      t.is(err.victim, 1);
      t.is(err.materials.length, 0);
    })
  );
});

test('debug version will emit error from userstate', t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: Q.IQuery[] = [
    Q.queryFactory(
      Q.duration(Q.timeDuration(durTarget)),
      Q.goal(Q.GoalKind.Atomic, Q.timeDuration(2), +dur(1, 'day')),
      Q.transforms([Q.need(true)], [], [])
    ),
  ];
  const [errors, pots, mats] = queriesToPipelineDebug$(config, true)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return Observable.forkJoin(errors, pots, mats).pipe(
    takeLast(1),
    map(([error, pot, mat]) => {
      if (error) {
        t.pass('should emit errors');
      }
    })
  );
});

test('debug version will emit intermediate results', t => {
  t.plan(9);
  const config: IConfig = { endDate: 100, startDate: 0 };
  let lap = 0;
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.duration(Q.timeDuration(4, 2))),
    Q.queryFactory(Q.id(2), Q.duration(Q.timeDuration(4, 2))),
  ];
  const results = queriesToPipelineDebug$(config, true)(stateManager)(queries);
  return combineSchedulerObservables([results[0] as Observable<any>, results[1], results[2]]).pipe(
    map(result => {
      if (lap === 1) {
        t.is(result.error, null);
        t.is(result.materials.length, 0);
        t.is(result.potentials.length, 2);
      } else if (lap === 2) {
        t.is(result.error, null);
        t.is(result.materials.length, 0);
        t.is(result.potentials.length, 0);
      } else if (lap === 3) {
        t.is(result.error, null);
        t.is(result.potentials.length, 0);
        t.is(result.materials.length, 2);
      } else if (lap > 3) {
        t.fail();
      }
      lap += 1;
    })
  );
});

test('debug version will emit materials and potentials stream', t => {
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
  const [errors, pots, mats] = queriesToPipelineDebug$(config, true)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return Observable.forkJoin(errors, pots, mats).pipe(
    takeLast(1),
    map(([error, pot, mat]) => {
      if (error) {
        t.fail('should not emit errors');
      }
      t.true(mat.length === 3);
      validateSE(t, mat[0], [+now, atomicStart], 2);
      validateSE(t, mat[1], [atomicStart, atomicEnd], 1);
      validateSE(t, mat[2], [atomicEnd, config.endDate], 2);
    })
  );
});
