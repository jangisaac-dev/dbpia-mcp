import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDbpiaXml } from '../../src/dbpia/parseXml.js';
import { normalizeDbpiaResponse, computeStableId } from '../../src/dbpia/normalize.js';

const fixtureDir = join(__dirname, '../fixtures/dbpia');

describe('DBpia Normalization', () => {
  it('should parse and normalize search_se.xml', () => {
    const xml = readFileSync(join(fixtureDir, 'search_se.xml'), 'utf-8');
    const parsed = parseDbpiaXml(xml);
    const result = normalizeDbpiaResponse(parsed, 'se');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe('NODE01234567');
    expect(item.title).toBe('테스트 논문 제목 (Search)');
    expect(item.authors).toContain('홍길동');
    expect(item.publisher).toBe('테스트 학회');
    expect(item.year).toBe('2023');
    expect(item.url).toContain('nodeId=NODE01234567');
    expect(item.raw_json).toBeDefined();
  });

  it('should parse and normalize rated_art.xml', () => {
    const xml = readFileSync(join(fixtureDir, 'rated_art.xml'), 'utf-8');
    const parsed = parseDbpiaXml(xml);
    const result = normalizeDbpiaResponse(parsed, 'rated_art');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.id).toBe('NODE07654321');
    expect(item.title).toBe('인기 논문 제목 (Rated Art)');
    expect(item.authors).toContain('이순신');
    expect(item.year).toBe('2023');
    expect(item.raw_json).toBeDefined();
  });

  it('should handle multiple authors', () => {
    const xml = `
      <root>
        <result>
          <items>
            <item>
              <title>Multi Author</title>
              <authors>
                <author>Author 1</author>
                <author>Author 2</author>
              </authors>
            </item>
          </items>
        </result>
      </root>
    `;
    const parsed = parseDbpiaXml(xml);
    const result = normalizeDbpiaResponse(parsed, 'se');
    expect(result.items[0].authors).toEqual(['Author 1', 'Author 2']);
  });

  it('should handle single author (forced array)', () => {
    const xml = `
      <root>
        <result>
          <items>
            <item>
              <title>Single Author</title>
              <authors>
                <author>Only One</author>
              </authors>
            </item>
          </items>
        </result>
      </root>
    `;
    const parsed = parseDbpiaXml(xml);
    const result = normalizeDbpiaResponse(parsed, 'se');
    expect(result.items[0].authors).toEqual(['Only One']);
  });

  it('should compute stable ID fallback when no ID is present', () => {
    const item = {
      title: 'No ID Paper',
      authors: ['A', 'B'],
      year: '2024',
      publisher: 'Test Pub'
    };
    const id1 = computeStableId(item, {});
    const id2 = computeStableId(item, {});
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
    
    const item2 = { ...item, title: 'Different' };
    const id3 = computeStableId(item2, {});
    expect(id1).not.toBe(id3);
  });

  it('should use native ID if present in raw_json', () => {
    const raw = { id: 'NATIVE_123' };
    const id = computeStableId({}, raw);
    expect(id).toBe('NATIVE_123');
  });

  it('should use DOI if present and no ID', () => {
    const raw = { doi: '10.1234/5678' };
    const id = computeStableId({}, raw);
    expect(id).toBe('10.1234/5678');
  });
});
