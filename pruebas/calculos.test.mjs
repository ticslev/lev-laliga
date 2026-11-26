// Pruebas de los cálculos que no dependen de la base: node --test pruebas/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rondasTodosContraTodos, segundosReloj, minutoActual } from '../worker/datos.js';
import { siglaDe, slug, fechaValida } from '../worker/util.js';

test('todos contra todos: cada par se enfrenta una sola vez', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const rondas = rondasTodosContraTodos(ids);
    const pares = new Set();
    for (const ronda of rondas) {
      const enRonda = new Set();
      for (const [a, b] of ronda) {
        assert.notEqual(a, b);
        assert.ok(!enRonda.has(a) && !enRonda.has(b), 'nadie juega dos veces en una jornada');
        enRonda.add(a); enRonda.add(b);
        pares.add([a, b].sort().join('-'));
      }
    }
    assert.equal(pares.size, (n * (n - 1)) / 2);
  }
});

test('ida y vuelta duplica las jornadas con localía invertida', () => {
  const r = rondasTodosContraTodos([1, 2, 3, 4], true);
  assert.equal(r.length, 6);
  assert.deepEqual(r[3][0], [...r[0][0]].reverse());
});

test('reloj del partido', () => {
  const p = { reloj_base: 600, reloj_inicio: 1_000_000 };
  assert.equal(segundosReloj(p, 1_000_000 + 90_000), 690);
  assert.equal(minutoActual(p, 1_000_000 + 90_000), 12);
  assert.equal(segundosReloj({ reloj_base: 300, reloj_inicio: null }, 9e12), 300);
});

test('siglas, slugs y fechas', () => {
  assert.equal(siglaDe('9no Solidarios'), '9S');
  assert.equal(siglaDe('2do BGU Honestos'), '2H');
  assert.equal(siglaDe('Docentes'), 'D');
  assert.equal(slug('Fútbol · Básica Superior'), 'futbol-basica-superior');
  assert.equal(fechaValida('2026-11-26T13:30'), '2026-11-26T13:30');
  assert.equal(fechaValida('2026-02-30'), undefined);
  assert.equal(fechaValida(''), null);
});
