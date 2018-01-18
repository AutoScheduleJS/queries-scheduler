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
- When all possible queries are placed and some potentials are left, throw exception. New provider query is pushed (send needer id so provider query can have a direct dependency). Can now be placed thanks to user state potential.
- Temp Queries: fixes from agent feedback, placeholder, content with transforms.
- two ways to provide: provider depends on needed task; needed task depends on provider.
- tasks with zero potential have pressure of -1 instead of +Infinity.
- task potential = intersection of query potential (internal constraints) + query dependencies + user state potential + materials.
- impossible to place (material time) => throw exception. (conflict)
- query that occurs x time before/after state: Link to material that update state -> link field, queries-scheduler module.
- Only one exception is permitted: conflict error that needs user. Others are caught (from userstate) with conflict-resolver

when the stream complete without error, it should be the final timeline.

schedule (tasks (materials)):
- tasks (potentials)

tasks (potentials):
- queries
- tasks (potentials)
- tasks (materials)
- user state (potentials)
- user state (materials)

tasks with needs:
- tasks (materials)
- agent service

Stream:
1. agent queries
2. user interaction
3. [1, 2] queries
4. [3, 5] queries with temp
5. [4, 5, 7] tasks (potential) - use user-state function on tasks (potential & material)
7. [5] tasks (material)
9. [7] needs and fixes, placeholder fill or validate

a. Catch errors from [7] => generate new queries at [1].

Module:
[1] queries-fn
[2, 3] main app
[4, 5, 7] queries-scheduler
userstate-manager
[a] conflic-resolver
[b] agent-relay

Module a: if provider is impossible to place, either there is no need for it, or there is a conflict. Use user-state to determine.
userstate-manager: query + (potential/material) with needs + config + base needs => ranges of possibilities