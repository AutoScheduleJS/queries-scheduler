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

schedule (tasks (materials)):
place potentials with most pressure.
invalidate placement when incompatible user state transformation ?
- tasks (potentials)

tasks (potentials):
- queries
- tasks (potentials)
- tasks (materials)
- user state (potentials)
- user state (materials)

user state (material):
- materials

user state (potential):
- potentials