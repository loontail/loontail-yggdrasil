import { describe, expect, it } from 'vitest';
import { ProfileLookupQuerySchema } from '../src/index.js';

describe('ProfileLookupQuerySchema', () => {
  it('defaults omitted unsigned to false so profile lookups are signed by default', () => {
    expect(ProfileLookupQuerySchema.parse({})).toEqual({ unsigned: false });
  });

  it('parses unsigned=true and unsigned=false query strings', () => {
    expect(ProfileLookupQuerySchema.parse({ unsigned: 'true' })).toEqual({ unsigned: true });
    expect(ProfileLookupQuerySchema.parse({ unsigned: 'false' })).toEqual({ unsigned: false });
  });
});
