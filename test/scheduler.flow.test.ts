import * as Q from '@autoschedule/queries-fn';
import { queryToStatePotentials } from '@autoschedule/userstate-manager';
import test from 'ava';
import * as moment from 'moment';
import { EMPTY, forkJoin, Observable } from 'rxjs';
import { catchError, distinctUntilChanged, map, takeLast } from 'rxjs/operators';
import {
  combineSchedulerObservables,
  queriesToPipeline$,
  queriesToPipelineDebug$,
} from '../src/data-flows/scheduler.flow';
import { IConfig } from '../src/data-structures/config.interface';
import { ConflictError } from '../src/data-structures/conflict.error';
import { IMaterial } from '../src/data-structures/material.interface';

const dur = moment.duration;
const stateManager = queryToStatePotentials([]);

const validateSE = (t: any, material: IMaterial, range: [number, number], id: number): void => {
  t.is(material.queryId, id);
  t.is(material.start, range[0]);
  t.is(material.end, range[1]);
};

test('will schedule nothing when no queries', t => {
  t.plan(1);
  const config: IConfig = { endDate: +moment().add(7, 'days'), startDate: Date.now() };
  return queriesToPipeline$(config)(stateManager)([]).pipe(map(result2 => t.is(result2.length, 0)));
});

test('will schedule dummy query', t => {
  t.plan(1);
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQueryInternal[] = [Q.queryFactory(Q.id(1))];
  return (queriesToPipelineDebug$(config)(stateManager)(queries)[0] as Observable<any>).pipe(
    map(_ => {
      t.pass();
    })
  );
});

test('will properly use pressureChunk and minDuration', t => {
  t.plan(5);
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.positionHelper(Q.duration(4, 2))),
    Q.queryFactory(Q.id(2), Q.positionHelper(Q.duration(4, 2))),
    Q.queryFactory(Q.id(3), Q.positionHelper(Q.duration(4, 2), Q.start(1), Q.end(5))),
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
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.positionHelper(Q.duration(4, 2), Q.start(97))),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 1);
      t.is(result[0].start, 96);
      t.is(result[0].end, 100);
    })
  );
});

test('will schedule one atomic query', t => {
  t.plan(3);
  const config: IConfig = { endDate: +moment().add(1, 'days'), startDate: Date.now() };
  const durTarget = +dur(1.5, 'hours');
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.positionHelper(Q.duration(durTarget, +dur(1, 'hours')))),
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
  const config: IConfig = { endDate: 5, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.name('atomic 1'), Q.positionHelper(Q.start(1, 1, 1), Q.end(3, 3, 3))),
    Q.queryFactory(Q.id(2), Q.name('atomic 2'), Q.positionHelper(Q.start(1, 1, 1), Q.end(4, 4, 4))),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    catchError(_ => {
      t.pass();
      return EMPTY;
    }),
    map(_ => {
      t.fail('should not pass');
    })
  );
});

test('will find space where resource is available from material', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const consumer = Q.queryFactory(
    Q.positionHelper(Q.duration(1)),
    Q.transformsHelper([Q.need(true, 'test', { response: 42 }, 1)], [], [])
  );
  const provide = Q.queryFactory(
    Q.id(66),
    Q.positionHelper(Q.duration(1)),
    Q.transformsHelper([], [], [{ collectionName: 'test', doc: { response: 42 }, quantity: 1 }])
  );
  return queriesToPipeline$(config)(stateManager)([consumer, provide]).pipe(
    map(result => {
      t.is(result.length, 2);
      t.true(result[0].start === 0);
      t.true(result[0].end === 1);
      t.true(result[1].start === 1);
      t.true(result[1].end === 2);
    })
  );
});

/**
 * Why Query2 start in priority:
 * Both have boundaries of [0-100]
 * Query2 has a target larger than query1, so it needs more time and thus has a greater pressure
 */
test('will stabilize with timeDuration', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const query1 = Q.queryFactory(Q.id(1), Q.positionHelper(Q.duration(2, 2), Q.start(3), Q.end(5)));
  const query2 = Q.queryFactory(Q.positionHelper(Q.duration(4, 2)), Q.id(2));
  return queriesToPipeline$(config)(stateManager)([query1, query2]).pipe(
    map(result => {
      t.is(result.length, 2);
      t.is(result[0].start, 3);
      t.is(result[0].end, 5);
      t.is(result[1].end - result[1].start, 4);
    })
  );
});

test('provider will wait consumer', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const consumer = Q.queryFactory(
    Q.id(1),
    Q.positionHelper(Q.start(3), Q.end(5)),
    Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, 'ref')], [], [])
  );
  const provider = Q.queryFactory(
    Q.id(2),
    Q.positionHelper(Q.duration(4, 2)),
    Q.transformsHelper(
      [],
      [],
      [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
    )
  );
  return queriesToPipeline$(config)(stateManager)([consumer, provider]).pipe(
    map(result => {
      t.is(result.length, 2);
    })
  );
});

test('provider will wait consumer which have Q.duration', t => {
  const config: IConfig = { endDate: 50, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('consumer'),
      Q.positionHelper(Q.duration(4, 2), Q.start(45), Q.end(49)),
      Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, '1')], [], [])
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('provider'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper(
        [],
        [],
        [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
      )
    ),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 2);
    })
  );
});

test('provider will error when impossible to place', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const consumer = Q.queryFactory(
    Q.id(1),
    Q.positionHelper(Q.start(1, 1, 1), Q.end(5, 5, 5)),
    Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, 'ref')], [], [])
  );
  const provider = Q.queryFactory(
    Q.id(2),
    Q.positionHelper(Q.duration(4, 2)),
    Q.transformsHelper(
      [],
      [],
      [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
    )
  );
  return queriesToPipelineDebug$(config)(stateManager)([consumer, provider])[0].pipe(
    takeLast(1),
    map(errors => {
      t.truthy(errors);
    })
  );
});

test('will emit error from userstate', t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.positionHelper(Q.duration(durTarget)),
      Q.transformsHelper([Q.need(true)], [], [])
    ),
  ];

  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    catchError(_ => {
      t.pass();
      return EMPTY;
    }),
    map(_ => t.fail())
  );
});

test('debug version will emit errors and close stream', t => {
  const config: IConfig = { endDate: 5, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.name('atomic 1'), Q.positionHelper(Q.start(1, 1, 1), Q.end(3, 3, 3))),
    Q.queryFactory(Q.id(2), Q.name('atomic 2'), Q.positionHelper(Q.start(1, 1, 1), Q.end(4, 4, 4))),
  ];
  const [errors] = queriesToPipelineDebug$(config)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return errors.pipe(
    map(e => {
      t.true(e instanceof ConflictError);
      const err = e as ConflictError;
      t.is(err.victim, 2);
      t.is(err.materials.length, 0);
    })
  );
});

test('debug version will emit error from userstate', t => {
  const config: IConfig = { endDate: +moment().add(3, 'days'), startDate: Date.now() };
  const durTarget = +dur(5, 'minutes');
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.positionHelper(Q.duration(durTarget)),
      Q.transformsHelper([Q.need(true)], [], [])
    ),
  ];
  const [errors, pots, mats] = queriesToPipelineDebug$(config)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return forkJoin(errors, pots, mats).pipe(
    takeLast(1),
    map(([error, _1, _2]) => {
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
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(Q.id(1), Q.positionHelper(Q.duration(4, 2))),
    Q.queryFactory(Q.id(2), Q.positionHelper(Q.duration(4, 2))),
  ];
  const results = queriesToPipelineDebug$(config)(stateManager)(queries);
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
        t.is(result[1].length, 1);
        t.is(result[2], null);
      } else if (lap === 4) {
        t.is(result[0], null);
        t.is(result[1].length, 0);
        t.is(result[2], null);
      } else if (lap === 5) {
        t.is(result[0], null);
        t.is(result[1].length, 0);
        t.is(result[2].length, 0);
      } else if (lap === 6) {
        t.is(result[0], null);
        t.is(result[1].length, 0);
        t.is(result[2].length, 1);
        t.is(result[3], null);
      } else if (lap === 7) {
        t.is(result[0], null);
        t.is(result[1].length, 0);
        t.is(result[2].length, 2);
        t.is(result[3], null);
      } else if (lap > 12) {
        t.fail();
      }
      lap += 1;
    })
  );
});

test('debug version will emit materials and potentials stream', t => {
  const config: IConfig = { endDate: 50, startDate: 0 };
  const atomicStart = 10;
  const atomicEnd = 30;
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('atomic 1'),
      Q.positionHelper(
        Q.start(atomicStart, atomicStart, atomicStart),
        Q.end(atomicEnd, atomicEnd, atomicEnd)
      )
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('splittable goal 1'),
      Q.positionHelper(Q.duration(50, 30)),
      Q.splittable()
    ),
  ];
  const [errors, pots, mats] = queriesToPipelineDebug$(config)(stateManager)(queries);
  if (errors == null) {
    return t.fail('errors should not be null');
  }
  return forkJoin(errors, pots, mats).pipe(
    takeLast(1),
    map(([error, _, mat]) => {
      if (error) {
        t.fail('should not emit errors');
      }
      t.true(mat.length === 3);
      validateSE(t, mat[0], [0, atomicStart], 2);
      validateSE(t, mat[1], [atomicStart, atomicEnd], 1);
      validateSE(t, mat[2], [atomicEnd, config.endDate], 2);
    })
  );
});

test('Will handle provider of provider', t => {
  const config: IConfig = { endDate: 50, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('consumer'),

      Q.positionHelper(Q.duration(4, 2), Q.start(45, 1), Q.end(49, 5)),
      Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, '1')], [], [])
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('provide_toto'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper(
        [Q.need(false, 'col', { test: 'tata' }, 1, '1')],
        [],
        [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
      )
    ),
    Q.queryFactory(
      Q.id(3),
      Q.name('provide_tata'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper(
        [],
        [],
        [{ collectionName: 'col', doc: { test: 'tata' }, quantity: 1, wait: true }]
      )
    ),
  ];
  return queriesToPipeline$(config)(stateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 3);
    })
  );
});

test('will handle empty need search', t => {
  const config: IConfig = { endDate: 100, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('consumer'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, '1')], [], [])
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('provider'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper(
        [Q.need(false, 'col', {}, 1, '1')],
        [],
        [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
      )
    ),
  ];
  const testStateManager = queryToStatePotentials([]);
  return queriesToPipeline$(config)(testStateManager)(queries).pipe(
    map(result => {
      t.true(result.length > 0);
    })
  );
});

test('will correctly link queries', t => {
  const config: IConfig = { endDate: 50, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('query'),
      Q.positionHelper(Q.duration(4, 2), Q.start(25), Q.end(30))
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('query'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.links([Q.queryLink({ max: 10, min: 5 }, 'end', 1, 0)])
    ),
  ];
  const testStateManager = queryToStatePotentials([]);
  return queriesToPipeline$(config)(testStateManager)(queries).pipe(
    map(result => {
      t.true(result.length > 0);
    })
  );
});

test('will work when provider potential has multiple places', t => {
  const config: IConfig = { endDate: 50, startDate: 0 };
  const queries: Q.IQueryInternal[] = [
    Q.queryFactory(
      Q.id(1),
      Q.name('consumer'),
      Q.positionHelper(Q.duration(4, 2), Q.start(45), Q.end(49)),
      Q.transformsHelper([Q.need(false, 'col', { test: 'toto' }, 1, '1')], [], [])
    ),
    Q.queryFactory(
      Q.id(2),
      Q.name('provider'),
      Q.positionHelper(Q.duration(4, 2)),
      Q.transformsHelper(
        [Q.need(false, 'col', { test: 'tata' }, 1, '1')],
        [],
        [{ collectionName: 'col', doc: { test: 'toto' }, quantity: 1, wait: true }]
      )
    ),
    Q.queryFactory(
      Q.id(3),
      Q.name('query'),
      Q.positionHelper(Q.duration(4, 2), Q.start(1), Q.end(5))
    ),
  ];
  const testStateManager = queryToStatePotentials([]);
  return queriesToPipeline$(config)(testStateManager)(queries).pipe(
    map(result => {
      t.is(result.length, 3);
      validateSE(t, result[0], [1, 5], 3);
      validateSE(t, result[1], [5, 9], 2);
      validateSE(t, result[2], [45, 49], 1);
    })
  );
});
