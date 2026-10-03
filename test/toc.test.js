import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tocEntries} from '../src/toc.js';

const sections = [
  {
    title: 'Guides',
    pages: [
      {title: 'Intro', headings: []},
      {
        title: 'Auth',
        headings: [
          {level: 3, id: 'orphan', text: 'Orphan h3'},
          {level: 2, id: 'keys', text: 'Keys'},
          {level: 3, id: 'scoped', text: 'Scoped'},
          {level: 2, id: 'errors', text: 'Errors'},
          {level: 3, id: 'e401', text: '401'},
        ],
      },
    ],
  },
  {title: 'API', pages: [{title: 'Overview', headings: [{level: 2, id: 'base', text: 'Base URL'}]}]},
];

test('numbers parts, pages and headings with matching targets', () => {
  const rows = tocEntries(sections).map((e) => `${e.level} ${e.num} ${e.title} #${e.target}`);
  assert.deepEqual(rows, [
    '0 1 Guides #part1',
    '1 1.1 Intro #p0',
    '1 1.2 Auth #p1',
    '2 1.2.1 Keys #p1-keys',
    '3 1.2.1.1 Scoped #p1-scoped',
    '2 1.2.2 Errors #p1-errors',
    '3 1.2.2.1 401 #p1-e401',
    '0 2 API #part2',
    '1 2.1 Overview #p2',
    '2 2.1.1 Base URL #p2-base',
  ]);
});

test('same heading name on different pages gets distinct targets', () => {
  const twin = [{title: 'S', pages: [{title: 'A', headings: [{level: 2, id: 'overview', text: 'Overview'}]}, {title: 'B', headings: [{level: 2, id: 'overview', text: 'Overview'}]}]}];
  const targets = tocEntries(twin).filter((e) => e.title === 'Overview').map((e) => e.target);
  assert.deepEqual(targets, ['p0-overview', 'p1-overview']);
});

test('depth trims heading levels', () => {
  assert.equal(tocEntries(sections, 0).filter((e) => e.level > 1).length, 0);
  assert.ok(tocEntries(sections, 1).every((e) => e.level < 3));
});
