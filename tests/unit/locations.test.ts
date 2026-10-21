import { describe, expect, it } from 'vitest';

import { NIGERIAN_STATES, STATE_NAMES, isValidState } from '../../src/lib/locations.js';

describe('locations', () => {
  it('contains 37 entries (36 states + FCT)', () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
  });

  it('includes all 36 states', () => {
    const expectedStates = [
      'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
      'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
      'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna',
      'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
      'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
      'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
    ];

    for (const state of expectedStates) {
      expect(NIGERIAN_STATES).toContain(state);
    }
  });

  it('includes the Federal Capital Territory', () => {
    expect(NIGERIAN_STATES).toContain('FCT');
  });

  it('has no duplicate entries', () => {
    expect(new Set(NIGERIAN_STATES).size).toBe(NIGERIAN_STATES.length);
  });

  it('isValidState returns true for known states', () => {
    expect(isValidState('Lagos')).toBe(true);
    expect(isValidState('FCT')).toBe(true);
    expect(isValidState('Cross River')).toBe(true);
  });

  it('isValidState returns false for unknown states', () => {
    expect(isValidState('New York')).toBe(false);
    expect(isValidState('lagos')).toBe(false); // case-sensitive
    expect(isValidState('')).toBe(false);
  });

  it('STATE_NAMES set matches the array', () => {
    expect(STATE_NAMES.size).toBe(NIGERIAN_STATES.length);
    for (const state of NIGERIAN_STATES) {
      expect(STATE_NAMES.has(state)).toBe(true);
    }
  });
});
