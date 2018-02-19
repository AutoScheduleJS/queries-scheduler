import * as Q from '@autoschedule/queries-fn';
import { queryToStatePotentials } from '@autoschedule/userstate-manager';
import test from 'ava';
import * as moment from 'moment';
import 'rxjs/add/observable/forkJoin';
import 'rxjs/add/observable/of';
import { Observable } from 'rxjs/Observable';
import { distinctUntilChanged, map, takeLast } from 'rxjs/operators';

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

test('will properly use pressureChunk and minDuration', t => {
  t.plan(5);
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.duration(Q.timeDuration(4, 2))),
    Q.queryFactory(Q.id(2), Q.duration(Q.timeDuration(4, 2))),
    Q.queryFactory(Q.id(3), Q.duration(Q.timeDuration(4, 2)), Q.start(1), Q.end(5)),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 3);
      t.is(result[0].start, 1);
      t.is(result[0].end, 5);
      t.is(result[1].start, 5);
      t.is(result[1].end, 9);
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

test('will find space where resource is available from material', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const query = Q.queryFactory(
    Q.duration(Q.timeDuration(1)),
    Q.transforms([Q.need(true, 'test', { response: 42 }, 1)], [], [])
  );
  const provide = Q.queryFactory(
    Q.id(66),
    Q.start(2),
    Q.end(3),
    Q.transforms([], [], [{ collectionName: 'test', doc: { response: 42 } }])
  );
  return queriesToPipeline$(config)(stateManager)([query, provide]).pipe(
    map(result => {
      t.is(result.length, 2);
      t.true(result[0].start === 2);
      t.true(result[0].end === 3);
      t.true(result[1].start === 99);
      t.true(result[1].end === 100);
    })
  );
});

test('provider will wait consumer', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const consumer = Q.queryFactory(
    Q.id(1),
    Q.start(3),
    Q.end(5),
    Q.transforms([Q.need(false, 'col', { test: 'toto' }, 1, 'ref')], [], [])
  );
  const provider = Q.queryFactory(
    Q.id(2),
    Q.duration(Q.timeDuration(4, 2)),
    Q.transforms([], [], [{ collectionName: 'col', doc: { test: 'toto' }, wait: true }])
  );
  return queriesToPipeline$(config)(stateManager)([consumer, provider]).pipe(
    map(result => {
      t.is(result.length, 2);
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
  t.plan(23);
  const config: IConfig = { endDate: 100, startDate: 0 };
  let lap = 0;
  const queries: Q.IQuery[] = [
    Q.queryFactory(Q.id(1), Q.duration(Q.timeDuration(4, 2))),
    Q.queryFactory(Q.id(2), Q.duration(Q.timeDuration(4, 2))),
  ];
  const results = queriesToPipelineDebug$(config, true)(stateManager)(queries);
  return combineSchedulerObservables(
    results[0] as Observable<any>,
    results[1],
    results[2],
    results[3]
  ).pipe(
    distinctUntilChanged(
      (a, b) =>
        a[1] === b[1] &&
        (a[1] != null && b[1] != null) &&
        a[1].length === b[1].length &&
        (a[2] === b[2] && (a[2] != null && b[2] != null) && a[2].length === b[2].length) &&
        (a[3] === b[3] && (a[3] != null && b[3] != null) && a[3].length === b[3].length)
    ),
    map(result => {
      if (lap === 1) {
        t.is(result[0], null);
        t.is(result[1].length, 0);
        t.is(result[2], null);
      } else if (lap === 2) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2], null);
      } else if (lap === 3) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2], null);
      } else if (lap === 4) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2].length, 0);
      } else if (lap === 5) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2].length, 2);
      } else if (lap === 6) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2].length, 2);
        t.is(result[3].length, 0);
      } else if (lap === 7) {
        t.is(result[0], null);
        t.is(result[1].length, 2);
        t.is(result[2].length, 2);
        t.is(result[3].length, 1);
      } else if (lap > 12) {
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
