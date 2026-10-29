import { describe, expect, it } from 'vitest';

import { calculateQueryDepth, inspectGraphQLRequests } from '../src/index.js';
import { request } from './fixtures.js';

describe('GraphQL inspector', () => {
  it('calculates query depth correctly', () => {
    const simple = '{ user { name } }';
    expect(calculateQueryDepth(simple)).toBe(2);

    const deep = '{ a { b { c { d { e { f } } } } } }';
    expect(calculateQueryDepth(deep)).toBe(6);

    const extraClosing = '} { a }';
    expect(calculateQueryDepth(extraClosing)).toBe(1);
  });

  it('ignores non-graphql requests', () => {
    const req = request({ url: 'https://app.test/api/items' });
    expect(inspectGraphQLRequests([req])).toEqual([]);
  });

  it('flags overly deep GraphQL queries', () => {
    const deepQuery = encodeURIComponent(
      '{ user { orders { items { product { categories { id } } } } } }',
    );
    const req = request({
      url: `https://app.test/graphql?query=${deepQuery}`,
    });

    const findings = inspectGraphQLRequests([req], 5);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('graphql-deep-query');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.evidence.measurements.depth).toBe(6);
  });

  it('passes shallow GraphQL queries within limits', () => {
    const shallowQuery = encodeURIComponent('{ user { id name } }');
    const req = request({
      url: `https://app.test/graphql?query=${shallowQuery}`,
    });

    expect(inspectGraphQLRequests([req], 5)).toEqual([]);
  });
});
