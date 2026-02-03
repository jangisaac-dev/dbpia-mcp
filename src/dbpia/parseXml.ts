import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
  isArray: (tagName, jPath, isLeafNode, isAttribute) => {
    return ['item', 'author', 'keyword'].includes(tagName);
  }
});

export function parseDbpiaXml(xml: string): any {
  if (!xml) return null;
  return parser.parse(xml);
}
