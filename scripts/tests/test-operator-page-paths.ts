import assert from 'node:assert/strict';
import test from 'node:test';
import { operatorPageAcceptsName, operatorPageNames, operatorPageRoute } from '../../lib/operators/operatorPagePaths';

test('case-only operator aliases export once while distinct former names keep their routes', () => {
  assert.deepEqual(operatorPageNames([
    { name: 'GALLUS²', aliases: ['Gallus²', 'GALLUS²', 'Gallus²'] },
    { name: "Kal'tsit Esperanta", aliases: ["Kal'tsit - Esperanta", "KAL'TSIT - ESPERANTA"] },
  ]), ['GALLUS²', "Kal'tsit Esperanta", "Kal'tsit - Esperanta"]);
  assert.deepEqual(operatorPageNames([{ name: 'Étoile', aliases: ['e\u0301toile'] }]), ['Étoile']);
});

test('conflicting operators are still emitted separately for duplicate-file validation', () => {
  assert.deepEqual(operatorPageNames([{ name: 'GALLUS²' }, { name: 'Gallus²' }]), ['GALLUS²', 'Gallus²']);
  assert.deepEqual(operatorPageNames([{ name: 'A', aliases: ['B'] }, { name: 'B' }]), ['A', 'B', 'B']);
});

test('published operator alias lookup preserves exact entries and refuses ambiguous matches', () => {
  const pages = { '/operators/GALLUS%C2%B2': {}, '/schedule': {} };
  assert.equal(operatorPageRoute(pages, '/operators/Gallus%C2%B2'), '/operators/GALLUS%C2%B2');
  assert.equal(operatorPageRoute(pages, '/schedule'), '/schedule');
  assert.equal(operatorPageRoute(pages, '/SCHEDULE'), null);
  assert.equal(operatorPageRoute(pages, '/operators/Gallus%C2%B2/other'), null);
  assert.equal(operatorPageRoute(pages, '/operators/%XX'), null);
  const ambiguous = { ...pages, '/operators/Gallus%C2%B2': {} };
  assert.equal(operatorPageRoute(ambiguous, '/operators/gallus%C2%B2'), null);
  assert.equal(operatorPageRoute(ambiguous, '/operators/Gallus%C2%B2'), '/operators/Gallus%C2%B2');
});

test('a matching page serves only the exact canonical name or explicitly recorded alias', () => {
  const props = { operator: { name: 'GALLUS²', aliases: ['Gallus²'] } };
  assert.equal(operatorPageAcceptsName(props, '/operators/GALLUS%C2%B2'), true);
  assert.equal(operatorPageAcceptsName(props, '/operators/Gallus%C2%B2'), true);
  assert.equal(operatorPageAcceptsName(props, '/operators/gallus%C2%B2'), false);
  assert.equal(operatorPageAcceptsName({}, '/operators/Gallus%C2%B2'), false);
  assert.equal(operatorPageAcceptsName(props, '/other/Gallus%C2%B2'), false);
});
