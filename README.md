# Queries Scheduler

> Place queries on a timeline.

[![Build Status](https://travis-ci.org/AutoScheduleJS/queries-scheduler.svg?branch=master)](https://travis-ci.org/AutoScheduleJS/queries-scheduler)
[![Maintainability](https://api.codeclimate.com/v1/badges/0a18d9fdd27919e0c45f/maintainability)](https://codeclimate.com/github/AutoScheduleJS/queries-scheduler/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/0a18d9fdd27919e0c45f/test_coverage)](https://codeclimate.com/github/AutoScheduleJS/queries-scheduler/test_coverage)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![Greenkeeper badge](https://badges.greenkeeper.io/AutoScheduleJS/queries-scheduler.svg)](https://greenkeeper.io/)
[![npm version](https://badge.fury.io/js/%40autoschedule%2Fqueries-scheduler.svg)](https://badge.fury.io/js/%40autoschedule%2Fqueries-scheduler)

workflow:
queries -> schedule

needs:
- once material is placed, don't replace it. Causes loops. Temporary query instead.

operations:
- place potentials with most pressure.
- When all possible queries are placed and some potentials are left, throw exception. New provider query is pushed. Can now be placed thanks to user state potential.
- two ways to provide: provider depends on needed task; needed task depends on provider.
- tasks with zero potential have pressure of -1 instead of +Infinity.
- task potential = intersection of query potential (internal constraints) + query dependencies + user state potential.
- impossible to place (material time) => throw exception. (conflict)

when the stream complete without error, it should be the final timeline.

schedule (tasks (materials)):
- tasks (potentials)

tasks (potentials):
- queries
- tasks (potentials)
- tasks (materials)
- user state (potentials)
- user state (materials)

user state (material):
- initial user state
- tasks (materials) with needs

user state (potential):
- initial user state
- tasks (potentials) with needs

tasks with needs:
- tasks (materials)
- agent service

Stream:
1. agent queries
2. user interaction
3. [1, 2] queries
4. [3, 5] queries with temp
5. [4, 5, 6, 7, 8] tasks (potential)
6. [5] user state (potential)
7. [5] tasks (material)
8. [7] user state (material)
9. [5] needs and fixes, placeholder fill or validate

a. Catch errors from [7] => generate new queries at [1].

Module:
[1] queries-fn
[2, 3] main app
[4, 5, 7] queries-scheduler
[6, 8] userstate-manager
[a] conflic-resolver
[b] agent-relay

Module a: if provider is impossible to place, either there is no need for it, or there is a conflict. Use user-state to determine.